const express = require("express");
const router = express.Router();
const {
  getAllUnits,
  createUnit,
  deleteUnit,
  createMultipleUnits,
} = require("../controllers/unitController.js");
router.get("/", getAllUnits);
router.post("/", createUnit);
router.post("/bulk", createMultipleUnits);
router.delete("/:id", deleteUnit);

module.exports = router;
