const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const path = require("path");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");

const audioFileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/x-wav",
    "audio/wave",
    "audio/x-wave",
    "audio/webm",
    "application/octet-stream",
  ];
  const allowedExtensions = [".mp3", ".wav", ".mpeg", ".webm", ".aac", ".ogg"];
  const fileMimeType = file.mimetype.toLowerCase();
  const fileExtension = path.extname(file.originalname).toLowerCase();
  const isMimeTypeValid = allowedMimeTypes.includes(fileMimeType);
  const isExtensionValid = allowedExtensions.includes(fileExtension);
  if (isMimeTypeValid && isExtensionValid) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Only audio files are allowed (mp3, wav, mpeg, webm, aac, ogg)"
      ),
      false
    );
  }
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024, files: 1 },
  fileFilter: audioFileFilter,
});

const imageFileFilter = (req, file, cb) => {
  const allowedMimeTypes = ["image/jpeg", "image/png", "image/gif"];
  const allowedExtensions = [".jpg", ".jpeg", ".png", ".gif"];
  const fileMimeType = file.mimetype.toLowerCase();
  const fileExtension = path.extname(file.originalname).toLowerCase();
  const isMimeTypeValid = allowedMimeTypes.includes(fileMimeType);
  const isExtensionValid = allowedExtensions.includes(fileExtension);
  if (isMimeTypeValid && isExtensionValid) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed (jpg, jpeg, png, gif)"), false);
  }
};

const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 }, // 10 MB limit
  fileFilter: imageFileFilter,
});

const createS3Client = () => {
  const requiredEnvVars = [
    "AWS_REGION",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
  ];
  const missingVars = requiredEnvVars.filter(
    (varName) => !process.env[varName]
  );
  if (missingVars.length > 0) {
    throw new Error(
      `Missing AWS environment variables: ${missingVars.join(", ")}`
    );
  }
  return new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
};

exports.uploadAudio = async (req, res) => {
  const uploadMiddleware = (req, res) => {
    return new Promise((resolve, reject) => {
      upload.single("audio")(req, res, (err) => {
        if (err) {
          return reject(err);
        }
        resolve();
      });
    });
  };

  try {
    await uploadMiddleware(req, res);
    if (!req.file) {
      return res
        .status(400)
        .json({ error: "No file uploaded or file type not allowed" });
    }

    const s3Client = createS3Client();
    const fileKey = `audio-files/${uuidv4()}-${req.file.originalname}`;
    const bucketName =
      process.env.S3_BUCKET_NAME || "autochart-audio-recording";

    const uploadParams = {
      Bucket: bucketName,
      Key: fileKey,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    };

    try {
      const command = new PutObjectCommand(uploadParams);
      const result = await s3Client.send(command);
      const fileUrl = `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;

      res.status(200).json({
        message: "File uploaded successfully",
        url: fileUrl,
        etag: result.ETag,
      });
    } catch (uploadError) {
      console.error("S3 Upload Error:", uploadError);
      res.status(500).json({
        error: "File upload to S3 failed",
        details: uploadError.message,
      });
    }
  } catch (error) {
    console.error("File Upload Error:", error);
    let errorMessage = "File upload failed";
    let statusCode = 400;
    if (error.code === "LIMIT_FILE_SIZE") {
      errorMessage = "File size exceeds the allowed limit of 500 MB";
      statusCode = 413;
    } else if (error.message.includes("audio files")) {
      errorMessage = error.message;
      statusCode = 415;
    }
    res.status(statusCode).json({ error: errorMessage });
  }
};

exports.validateAudioUpload = (req, res, next) => {
  upload.single("audio")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: err.message });
    } else if (err) {
      return res.status(415).json({ error: err.message });
    }
    next();
  });
};

exports.uploadProfilePic = async (req, res) => {
  const uploadMiddleware = (req, res) => {
    return new Promise((resolve, reject) => {
      uploadImage.single("image")(req, res, (err) => {
        if (err) {
          return reject(err);
        }
        resolve();
      });
    });
  };

  try {
    await uploadMiddleware(req, res);
    if (!req.file) {
      return res
        .status(400)
        .json({ error: "No file uploaded or file type not allowed" });
    }

    const s3Client = createS3Client();
    const fileKey = `profile-pics/${uuidv4()}-${req.file.originalname}`;
    const bucketName =
      process.env.S3_BUCKET_NAME || "autochart-audio-recording";

    const uploadParams = {
      Bucket: bucketName,
      Key: fileKey,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    };

    try {
      const command = new PutObjectCommand(uploadParams);
      const result = await s3Client.send(command);
      const fileUrl = `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;

      res.status(200).json({
        message: "Profile picture uploaded successfully",
        url: fileUrl,
        etag: result.ETag,
      });
    } catch (uploadError) {
      console.error("S3 Upload Error:", uploadError);
      res.status(500).json({
        error: "File upload to S3 failed",
        details: uploadError.message,
      });
    }
  } catch (error) {
    console.error("File Upload Error:", error);
    let errorMessage = "File upload failed";
    let statusCode = 400;
    if (error.code === "LIMIT_FILE_SIZE") {
      errorMessage = "File size exceeds the allowed limit of 10 MB";
      statusCode = 413;
    } else if (error.message.includes("image files")) {
      errorMessage = error.message;
      statusCode = 415;
    }
    res.status(statusCode).json({ error: errorMessage });
  }
};
