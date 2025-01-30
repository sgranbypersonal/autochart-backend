const Patient = require("../models/patient");
const crypto = require("crypto");
const Nurse = require("../models/nurse");
const { v4: uuidv4 } = require("uuid");
const jwt = require("jsonwebtoken");

const algorithm = process.env.ENCRYPTION_ALGORITHM;
const secretKey = Buffer.from(process.env.SECRET_KEY, "hex");

async function generateEmailHash(mrn) {
  return crypto.createHash("sha256").update(mrn).digest("hex");
}

function validateEncryptionFormat(data) {
  const [ivHex, encryptedText] = data.split(":");
  if (!ivHex || !encryptedText) {
    throw new Error(
      "Invalid encryption format. Data must be in 'iv:encryptedText' format."
    );
  }
}

function decrypt(text) {
  if (!text) return text;
  try {
    validateEncryptionFormat(text);
    const [ivHex, encryptedText] = text.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const decipher = crypto.createDecipheriv(algorithm, secretKey, iv);
    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (error) {
    console.error("Decryption error:", error.message);
    return text;
  }
}

function encrypt(text) {
  if (!text) return text;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, secretKey, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return `${iv.toString("hex")}:${encrypted}`;
}

exports.createSinglePatient = async (req, res) => {
  try {
    const patientData = {
      firstName: encrypt(req.body.firstName),
      lastInitial: encrypt(req.body.lastInitial),
      mrn: encrypt(req.body.mrn),
      dob: req.body.dob,
      unit: encrypt(req.body.unit),
      createdBy: req.user.userId,
    };
    const mrnLookup = await generateEmailHash(req.body.mrn);
    const existingMrn = await Patient.findOne({ mrnHash: mrnLookup });
    if (existingMrn) {
      return res.status(400).json({
        error: "MRN already exists",
      });
    }

    if (req.body.extensions && req.body.extensions.length > 0) {
      const extensions = req.body.extensions.map((ext) => ({
        chartId: ext.chartId || uuidv4(),
        audioUrl: encrypt(ext.audioUrl || "default-audio-url"),
        transcript: encrypt(ext.transcript || "Default transcript text"),
        extractedData: encrypt(ext.extractedData || "Default extracted data"),
        timestamp: ext.timestamp || new Date(),
      }));

      const uniqueChartIds = new Set(extensions.map((ext) => ext.chartId));
      if (uniqueChartIds.size !== extensions.length) {
        throw new Error("Duplicate chartId found in extensions");
      }
      patientData.extensions = extensions;
    }
    const newPatient = new Patient({
      ...patientData,
      mrnHash: mrnLookup,
    });
    await newPatient.save();
    res.status(201).json(newPatient);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.createMultiplePatients = async (req, res) => {
  try {
    const incomingPatientsData = req.body;
    const existingPatients = await Patient.find({
      mrnHash: {
        $in: await Promise.all(
          incomingPatientsData.map((p) => generateEmailHash(p.mrn))
        ),
      },
    });
    const existingMrnHashes = new Set(existingPatients.map((p) => p.mrnHash));

    const newPatientsData = [];
    const skippedPatients = [];
    const errors = [];

    for (const patient of incomingPatientsData) {
      try {
        const mrnHash = await generateEmailHash(patient.mrn);
        if (existingMrnHashes.has(mrnHash)) {
          skippedPatients.push(patient.mrn);
          continue; // Skip this patient and continue with the next
        }

        const patientData = {
          ...patient,
          createdBy: req.user.userId,
          mrnHash: mrnHash,
          extensions: (patient.extensions || []).map((ext) => ({
            _id: uuidv4(),
            chartId: ext.chartId || uuidv4(),
            audioUrl: encrypt(ext.audioUrl || "default-audio-url"),
            transcript: encrypt(ext.transcript || "Default transcript text"),
            extractedData: encrypt(
              ext.extractedData || "Default extracted data"
            ),
            timestamp: ext.timestamp || new Date(),
          })),
        };

        newPatientsData.push(patientData);
      } catch (innerErr) {
        console.error(
          `Error processing patient with MRN ${patient.mrn}:`,
          innerErr
        );
        errors.push({ mrn: patient.mrn, error: innerErr.message });
      }
    }

    if (newPatientsData.length > 0) {
      const patients = await Patient.insertMany(newPatientsData);
      res.status(201).json({
        createdPatients: patients,
        skippedPatients,
        errors,
        message: `${patients.length} patients created successfully, ${skippedPatients.length} skipped due to existing MRNs, ${errors.length} errors encountered.`,
      });
    } else {
      res.status(200).json({
        createdPatients: [],
        skippedPatients,
        errors,
        message: `No new patients created. ${skippedPatients.length} skipped due to existing MRNs, ${errors.length} errors encountered.`,
      });
    }
  } catch (err) {
    console.error("Error in createMultiplePatients:", err);
    res.status(500).json({
      error: "An error occurred while processing patients.",
      details: err.message,
    });
  }
};

const decryptPatientData = (patient) => {
  if (!patient) return null;
  const patientObj = patient.toObject();
  return {
    ...patientObj,
    firstName: patientObj.firstName ? decrypt(patientObj.firstName) : undefined,
    lastInitial: patientObj.lastInitial
      ? decrypt(patientObj.lastInitial)
      : undefined,
    mrn: patientObj.mrn ? decrypt(patientObj.mrn) : undefined,
    unit: patientObj.unit ? decrypt(patientObj.unit) : undefined,
    extensions: patientObj.extensions.map((extension) => ({
      ...extension,
      transcript: extension.transcript
        ? decrypt(extension.transcript)
        : undefined,
      extractedData: extension.extractedData
        ? decrypt(extension.extractedData)
        : undefined,
      audioUrl: extension.audioUrl ? decrypt(extension.audioUrl) : undefined,
    })),
    assignedTo: patientObj.assignedTo.map((assignment) => ({
      ...assignment,
      nurseName: assignment.nurseName
        ? decrypt(assignment.nurseName)
        : undefined,
    })),
  };
};

exports.allPatients = async (req, res) => {
  const { page = 1, limit = 1000 } = req.query;
  try {
    const patients = await Patient.find({ discharged: { $ne: true } })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const decryptedPatients = patients.map((patient) =>
      decryptPatientData(patient)
    );

    const totalPatients = await Patient.countDocuments({
      discharged: { $ne: true },
    });
    res.json({
      totalPatients,
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalPatients / limit),
      patients: decryptedPatients,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.myPatients = async (req, res) => {
  const { page = 1, limit = 1000 } = req.query;
  try {
    const patients = await Patient.find({ createdBy: req.user.userId })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const decryptedPatients = patients.map((patient) =>
      decryptPatientData(patient)
    );

    const totalPatients = await Patient.countDocuments({
      createdBy: req.user.userId,
    });
    res.json({
      totalPatients,
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalPatients / limit),
      patients: decryptedPatients,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getSinglePatient = async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    const decryptedPatient = decryptPatientData(patient);
    if (decryptedPatient.extensions && decryptedPatient.extensions.length > 0) {
      decryptedPatient.extensions = decryptedPatient.extensions.map(
        (extension) => {
          if (extension.extractedData) {
            try {
              if (typeof extension.extractedData === "object") {
                return extension;
              }
              const parsedData = JSON.parse(extension.extractedData);
              return {
                ...extension,
                extractedData: parsedData,
              };
            } catch (error) {
              console.error("Error parsing extractedData:", error);
              return {
                ...extension,
                extractedData: {},
              };
            }
          }
          return extension;
        }
      );
    }

    res.json(decryptedPatient);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateSinglePatient = async (req, res) => {
  try {
    if (req.body.extensions) {
      const extensions = req.body.extensions.map((ext) => ({
        chartId: ext.chartId || uuidv4(),
        audioUrl: ext.audioUrl || "default-audio-url",
        transcript: ext.transcript || "Default transcript text",
        extractedData: ext.extractedData || "Default extracted data",
        timestamp: ext.timestamp || new Date(),
      }));

      const uniqueChartIds = new Set(extensions.map((ext) => ext.chartId));
      if (uniqueChartIds.size !== extensions.length) {
        throw new Error("Duplicate chartId found in extensions");
      }

      const updatedPatient = await Patient.findByIdAndUpdate(
        req.params.id,
        { $push: { extensions: { $each: extensions } } },
        { new: true }
      );

      if (!updatedPatient) {
        return res.status(404).json({ message: "Patient not found" });
      }
      return res.json(updatedPatient);
    }

    const updatedPatient = await Patient.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    if (!updatedPatient) {
      return res.status(404).json({ message: "Patient not found" });
    }
    res.json(updatedPatient);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.deleteSinglePatient = async (req, res) => {
  try {
    const deletedPatient = await Patient.findByIdAndDelete(req.params.id);
    if (!deletedPatient) {
      return res.status(404).json({ message: "Patient not found" });
    }
    res.json({ message: "Patient deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteMultiplePatients = async (req, res) => {
  console.log("deleteMultiplePatients called with body:", req.body);
  try {
    const { ids } = req.body;
    if (!ids) {
      return res.status(400).json({ error: "No IDs provided" });
    }
    const result = await Patient.deleteMany({ _id: { $in: ids } });
    res.json({
      message: `${result.deletedCount} patients deleted successfully`,
    });
  } catch (err) {
    console.error("Error in deleteMultiplePatients:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.dischargePatient = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.user || !req.user.userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const patient = await Patient.findByIdAndUpdate(
      id,
      {
        discharged: true,
        dischargedBy: req.user.userId,
        dischargeDate: new Date(),
      },
      { new: true }
    ).populate("dischargedBy", "name email role");

    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    res.json({
      message: "Patient discharged successfully",
      patient,
      dischargedBy: req.user.userId,
    });
  } catch (err) {
    console.error("Error in dischargePatient:", err);
    res.status(500).json({
      error: "An error occurred while discharging the patient",
      details: err.message,
    });
  }
};

exports.bulkAssignPatients = async (req, res) => {
  try {
    const { nurseId, patientIds } = req.body;

    const nurse = await Nurse.findById(nurseId);
    if (!nurse) {
      return res.status(404).json({ message: "Nurse not found" });
    }

    const decryptedFirstName = decrypt(nurse.firstName);
    const decryptedLastName = decrypt(nurse.lastName);

    const updateResult = await Patient.updateMany(
      { _id: { $in: patientIds }, "assignedTo.nurseId": { $ne: nurseId } },
      {
        $addToSet: {
          assignedTo: {
            nurseId: nurse.id,
            nurseName: encrypt(`${decryptedFirstName} ${decryptedLastName}`),
          },
        },
      }
    );

    res.status(200).json({
      message: `${updateResult.modifiedCount} patients assigned successfully`,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.bulkUnassignPatients = async (req, res) => {
  try {
    const { nurseId, patientIds } = req.body;

    const updatedPatients = await Patient.updateMany(
      { _id: { $in: patientIds } },
      { $pull: { assignedTo: { nurseId: nurseId } } },
      { new: true }
    );

    res.status(200).json({
      message: `${updatedPatients.modifiedCount} patients unassigned successfully`,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.getPatientDetails = async (req, res) => {
  try {
    const patients = await Patient.find(
      { extensions: { $exists: true, $not: { $size: 0 } } },
      {
        firstName: 1,
        lastInitial: 1,
        dob: 1,
        mrn: 1,
        extensions: 1,
        createdBy: 1,
        assignedTo: 1,
      }
    ).lean();

    if (!patients || patients.length === 0) {
      return res.status(404).json({ error: "No patients found" });
    }

    const decryptedPatients = patients.map((patient) => {
      const decryptedPatient = {
        ...patient,
        firstName: decrypt(patient.firstName),
        lastInitial: decrypt(patient.lastInitial),
        dob: decrypt(patient.dob),
        mrn: decrypt(patient.mrn),
        extensions: patient.extensions.map((extension) => {
          let extractedData = decrypt(extension.extractedData);
          try {
            if (typeof extractedData !== "object") {
              extractedData = JSON.parse(extractedData);
            }
          } catch (error) {
            console.error("Error parsing extractedData:", error);
            extractedData = {};
          }
          return {
            ...extension,
            transcript: decrypt(extension.transcript),
            extractedData,
            audioUrl: decrypt(extension.audioUrl),
          };
        }),
      };
      return decryptedPatient;
    });

    const flattenedData = decryptedPatients.flatMap((patient) =>
      patient.extensions.map((extension) => ({
        _id: patient._id,
        firstName: patient.firstName,
        lastInitial: patient.lastInitial,
        dob: patient.dob,
        mrn: patient.mrn,
        extension: extension,
        createdBy: patient.createdBy,
        assignedTo: patient.assignedTo,
      }))
    );

    res.status(200).json({
      count: flattenedData.length,
      patients: flattenedData,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getPatientDetailsById = async (req, res) => {
  const { id } = req.params;
  const { chartId } = req.query;

  try {
    const query = { _id: id };
    if (chartId) {
      query["extensions.chartId"] = chartId;
    }

    const patient = await Patient.findOne(query, {
      firstName: 1,
      lastInitial: 1,
      dob: 1,
      mrn: 1,
      "extensions.$": chartId ? 1 : 0,
      createdBy: 1,
      assignedTo: 1,
      updatedAt: 1,
    }).lean();

    if (!patient) {
      return res.status(404).json({ error: "Patient not found" });
    }

    const decryptedPatient = {
      ...patient,
      firstName: decrypt(patient.firstName),
      lastInitial: decrypt(patient.lastInitial),
      dob: decrypt(patient.dob),
      mrn: decrypt(patient.mrn),
      updatedAt: patient.updatedAt,
      extensions: patient.extensions.map((extension) => {
        let extractedData = decrypt(extension.extractedData);
        try {
          extractedData = JSON.parse(extractedData);
        } catch (error) {
          console.error("Error parsing extractedData:", error);
          extractedData = {};
        }
        return {
          ...extension,
          transcript: decrypt(extension.transcript),
          extractedData,
          audioUrl: decrypt(extension.audioUrl),
        };
      }),
    };

    const flattenedExtensions = decryptedPatient.extensions.map(
      (extension) => ({
        _id: decryptedPatient._id,
        firstName: decryptedPatient.firstName,
        lastInitial: decryptedPatient.lastInitial,
        dob: decryptedPatient.dob,
        mrn: decryptedPatient.mrn,
        updatedAt: decryptedPatient.updatedAt,
        extension,
        createdBy: decryptedPatient.createdBy,
        assignedTo: decryptedPatient.assignedTo,
      })
    );

    res.status(200).json({
      count: flattenedExtensions.length,
      patient: flattenedExtensions,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.undoDischargePatient = async (req, res) => {
  try {
    const { id } = req.params;
    const patient = await Patient.findByIdAndUpdate(
      id,
      { discharged: false },
      { new: true }
    );

    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    res.json({ message: "Patient discharge undone successfully", patient });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getDischargedPatients = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    let query = { discharged: true };
    switch (req.user.role) {
      case "superadmin":
        query = { discharged: true };
        break;
      case "admin":
        query = {
          discharged: true,
          $or: [
            { createdBy: req.user.userId },
            { dischargedBy: req.user.userId },
          ],
        };
        break;
      case "nurse":
        query = {
          discharged: true,
          $or: [
            { dischargedBy: req.user.userId },
            { "assignedTo.nurseId": req.user.userId },
          ],
        };
        break;
      default:
        return res.status(403).json({ error: "Invalid role" });
    }
    const dischargedPatients = await Patient.find(query)
      .populate("dischargedBy", "name email role")
      .populate("createdBy", "name email role")
      .sort({ dischargeDate: -1 });

    // Decrypt patient data
    const decryptedPatients = dischargedPatients.map((patient) => {
      const patientObj = patient.toObject();
      return {
        ...patientObj,
        firstName: decrypt(patientObj.firstName),
        lastInitial: decrypt(patientObj.lastInitial),
        mrn: decrypt(patientObj.mrn),
        unit: decrypt(patientObj.unit),
        assignedTo: patientObj.assignedTo.map((assignment) => ({
          ...assignment,
          nurseName: decrypt(assignment.nurseName),
        })),
        createdBy: {
          ...patientObj.createdBy,
          email: decrypt(patientObj.createdBy?.email),
        },
        dischargedBy: {
          ...patientObj.dischargedBy,
          email: decrypt(patientObj.dischargedBy?.email),
        },
      };
    });

    const response = {
      count: decryptedPatients.length,
      dischargedPatients: decryptedPatients,
      debug: {
        userRole: req.user.role,
        userId: req.user.userId,
        query: query,
      },
    };
    res.json(response);
  } catch (err) {
    res.status(500).json({
      error: "An error occurred while fetching discharged patients.",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

exports.getMyPatientsAssessments = async (req, res) => {
  try {
    const associateNurseId = req.headers["associate-nurse-id"];
    console.log("Received associateNurseId:", associateNurseId);

    if (!associateNurseId) {
      return res.status(400).json({
        success: false,
        error: "Nurse ID is required",
        patients: [],
      });
    }

    const patients = await Patient.find(
      {
        extensions: { $exists: true, $not: { $size: 0 } },
        "assignedTo.nurseId": associateNurseId,
      },
      {
        firstName: 1,
        lastInitial: 1,
        dob: 1,
        mrn: 1,
        extensions: 1,
        createdBy: 1,
        assignedTo: 1,
      }
    ).lean();

    if (!patients || patients.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No patients found for the given nurse ID",
        count: 0,
        patients: [],
      });
    }

    const decryptedPatients = patients.map((patient) => ({
      ...patient,
      firstName: decrypt(patient.firstName),
      lastInitial: decrypt(patient.lastInitial),
      dob: decrypt(patient.dob),
      mrn: decrypt(patient.mrn),
      extensions: patient.extensions.map((extension) => ({
        ...extension,
        transcript: decrypt(extension.transcript),
        extractedData: decrypt(extension.extractedData),
      })),
    }));

    const flattenedData = decryptedPatients.flatMap((patient) =>
      patient.extensions.map((extension) => ({
        _id: patient._id,
        firstName: patient.firstName,
        lastInitial: patient.lastInitial,
        dob: patient.dob,
        mrn: patient.mrn,
        extension: extension,
        createdBy: patient.createdBy,
        assignedTo: patient.assignedTo,
      }))
    );

    res.status(200).json({
      success: true,
      count: flattenedData.length,
      patients: flattenedData,
    });
  } catch (err) {
    console.error("Error fetching patient assessments:", err);
    res.status(500).json({
      success: false,
      error: "An error occurred while fetching patient assessments",
      details: err.message,
      patients: [],
    });
  }
};

