const logger = require('../config/logger');
const User = require("../models/user");
const Patient = require("../models/patient");
const { decrypt } = require("../utils/encryption");
const Nurse = require("../models/nurse");

const capitalizeFirstLetter = (string) => {
  if (!string) return '';
  return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
};

const formatFullNameWithInitial = (firstName, lastName) => {
  const formattedFirstName = capitalizeFirstLetter(firstName);
  const lastInitial = lastName ? capitalizeFirstLetter(lastName.charAt(0)) : '';
  return `${formattedFirstName} ${lastInitial}`.trim();
};

const logUserActions = async (req, res, next) => {
  const originalSend = res.send;
  const userId = req.user?.userId;

  try {
    if (userId) {
      const user = await User.findById(userId);
      const userName = user ? formatFullNameWithInitial(decrypt(user.firstName), decrypt(user.lastName)) || user.email : userId;

      // Pre-fetch data for DELETE requests
      let entityToDelete = null;
      if (req.method === 'DELETE') {
        const entityId = req.originalUrl.split('/').pop();
        if (req.originalUrl.startsWith('/api/patients/')) {
          entityToDelete = await Patient.findById(entityId);
        } else if (req.originalUrl.startsWith('/api/nurses/')) {
          entityToDelete = await Nurse.findById(entityId);
        }
      }

      res.send = async function (data) {
        let logMessage = `User ${userName} made a ${req.method} request to ${req.originalUrl}`;

        try {
          // For patient deletion
          if (req.method === 'DELETE' && req.originalUrl.startsWith('/api/patients/')) {
            if (entityToDelete) {
              const firstName = decrypt(entityToDelete.firstName);
              const lastInitial = decrypt(entityToDelete.lastInitial);
              const fullName = formatFullNameWithInitial(firstName, lastInitial);
              logMessage += ` to delete patient: ${fullName}`;
            }
          }

          // For nurse deletion
          if (req.method === 'DELETE' && req.originalUrl.startsWith('/api/nurses/')) {
            if (entityToDelete) {
              const firstName = decrypt(entityToDelete.firstName);
              const lastName = decrypt(entityToDelete.lastName);
              const fullName = formatFullNameWithInitial(firstName, lastName);
              logMessage += ` to delete nurse: ${fullName}`;
            }
          }

          // For nurse creation
          if (req.method === 'POST' && req.originalUrl === '/api/nurses') {
            const nurseData = req.body;
            const firstName = nurseData.firstName || '';
            const lastName = nurseData.lastName || '';
            if (firstName || lastName) {
              const fullName = formatFullNameWithInitial(firstName, lastName);
              logMessage += ` to create nurse: ${fullName}`;
            }
          }

          // For nurse updates
          if (req.method === 'PUT' && req.originalUrl.startsWith('/api/nurses/')) {
            const nurseId = req.originalUrl.split('/').pop();
            const nurse = await Nurse.findById(nurseId);
            if (nurse) {
              const firstName = decrypt(nurse.firstName);
              const lastName = decrypt(nurse.lastName);
              const fullName = formatFullNameWithInitial(firstName, lastName);
              logMessage += ` to update nurse: ${fullName}`;
            }
          }

          // For patient creation
          if (req.method === 'POST' && req.originalUrl === '/api/patients/single') {
            const patientData = req.body;
            const firstName = patientData.patientData?.firstName || patientData.firstName || '';
            const lastInitial = patientData.patientData?.lastInitial || patientData.lastName || '';
            const surname = patientData.patientData?.surname || patientData.surname || '';
            const finalLastName = lastInitial || surname || '';

            if (firstName || finalLastName) {
              const fullName = formatFullNameWithInitial(firstName, finalLastName);
              logMessage += ` to create patient: ${fullName}`;
            }
          }

          // For patient updates
          if (req.method === 'PUT' && req.originalUrl.startsWith('/api/patients/')) {
            const patientId = req.originalUrl.split('/').pop();
            const patient = await Patient.findById(patientId);
            if (patient) {
              const firstName = decrypt(patient.firstName);
              const lastInitial = decrypt(patient.lastInitial);
              const fullName = formatFullNameWithInitial(firstName, lastInitial);
              logMessage += ` to update patient: ${fullName}`;
            }
          }

        } catch (error) {
          console.error('Error processing response data:', error);
        }

        logger.info(logMessage);
        originalSend.apply(res, arguments);
      };
    }
    next();
  } catch (error) {
    console.error('Error in logUserActions middleware:', error);
    next();
  }
};

module.exports = logUserActions; 