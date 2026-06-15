const multer = require('multer');
const path = require('path');
const fs = require('fs');

const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/gif',
  'video/mp4', 'video/quicktime',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Step-level evidence: /uploads/steps/:stepId/
    // Case-level evidence: /uploads/cases/:caseId/general/
    let subdir;
    if (req.params.stepId) {
      subdir = path.join('steps', String(req.params.stepId));
    } else {
      subdir = path.join('cases', String(req.params.caseId), 'general');
    }
    const dir = path.join(process.env.UPLOAD_DIR || './uploads', subdir);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, unique + path.extname(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  if (ALLOWED_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not allowed`));
  }
};

const maxBytes = (parseInt(process.env.MAX_FILE_SIZE_MB) || 50) * 1024 * 1024;

module.exports = multer({ storage, fileFilter, limits: { fileSize: maxBytes } });
