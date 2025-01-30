const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const morgan = require("morgan");
require("dotenv").config();
const connectDB = require("./config/db");
const nurseRoutes = require("./routes/nurseRoutes");
const authRoutes = require("./routes/authRoutes");
const patientRoutes = require("./routes/patientRoutes");
const uploadRoutes = require("./routes/uploadRoutes.js");
const unitRoutes = require("./routes/units");
const logRoutes = require("./routes/logRoutes");
const { verifyToken } = require("./middlewares/verifyToken");
const logUserActions = require("./middlewares/logUserActions");

connectDB();
const app = express();
app.use(cors());
app.use(bodyParser.json());

// Custom token to exclude GET requests
morgan.token('exclude-get', (req, res) => {
  return req.method !== 'GET' ? `${req.method} ${req.url}` : null;
});

app.use(morgan(':exclude-get'));

app.use("/api/auth", logUserActions, authRoutes);
app.use("/api/nurses", verifyToken, logUserActions, nurseRoutes);
app.use("/api/patients", verifyToken, logUserActions, patientRoutes);
app.use("/api/upload", verifyToken, logUserActions, uploadRoutes);
app.use("/api/units", verifyToken, logUserActions, unitRoutes);
app.use("/api", logRoutes);



module.exports = app;
