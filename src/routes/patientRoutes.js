const express = require("express");
const router = express.Router();
const {
  createSinglePatient,
  createMultiplePatients,
  allPatients,
  myPatients,
  getSinglePatient,
  updateSinglePatient,
  deleteSinglePatient,
  deleteMultiplePatients,
  dischargePatient,
  bulkAssignPatients,
  bulkUnassignPatients,
  getPatientDetails,
  getPatientDetailsById,
  undoDischargePatient,
  getDischargedPatients,
  getMyPatientsAssessments,
} = require("../controllers/patientController");
const { verifyToken, checkRole } = require("../middlewares/verifyToken");
router.patch("/:id/undo-discharge", verifyToken, undoDischargePatient);
router.get("/allpatients", verifyToken, allPatients);
router.get("/mypatients", verifyToken, myPatients);
router.get("/:id", verifyToken, getSinglePatient);
router.post("/single", verifyToken, createSinglePatient);
router.post("/multiple", verifyToken, createMultiplePatients);
router.put("/:id", verifyToken, updateSinglePatient);
router.delete("/:id", verifyToken, deleteSinglePatient);
router.post("/bulk-delete", verifyToken, deleteMultiplePatients);
router.patch("/:id/discharge", verifyToken, dischargePatient);
router.post("/bulk-assign", verifyToken, bulkAssignPatients);
router.post("/bulk-unassign", verifyToken, bulkUnassignPatients);
router.get("/assessment/details", verifyToken, getPatientDetails);
router.get("/assessment/details/:id", verifyToken, getPatientDetailsById);
router.get(
  "/status/discharged",
  verifyToken,
  checkRole(["superadmin", "admin", "nurse"]),
  getDischargedPatients
);
router.get(
  "/assessment/my-details",
  verifyToken,
  checkRole(["superadmin", "admin", "nurse"]),
  getMyPatientsAssessments
);
module.exports = router;
