const Unit = require("../models/unit");
exports.getAllUnits = async (req, res) => {
  try {
    const units = await Unit.find();
    res.json(units);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
exports.createUnit = async (req, res) => {
  const unit = new Unit({
    name: req.body.name,
    description: req.body.description,
  });

  try {
    const newUnit = await unit.save();
    res.status(201).json(newUnit);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
exports.deleteUnit = async (req, res) => {
  try {
    const unit = await Unit.findByIdAndDelete(req.params.id);
    if (!unit) return res.status(404).json({ message: "Unit not found" });

    res.json({ message: "Unit deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createMultipleUnits = async (req, res) => {
  try {
    const units = req.body.units;
    const newUnits = await Unit.insertMany(units);
    res.status(201).json(newUnits);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
