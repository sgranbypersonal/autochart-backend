const express = require("express");
const router = express.Router();
const { uploadAudio, uploadProfilePic } = require("../controllers/uploadController.js");

router.post("/audio", uploadAudio);
router.post("/profile-pic", uploadProfilePic);

module.exports = router;
