const multer = require('multer');
const path = require('path');
const fs = require('fs');

const ALLOWED = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'video/mp4', 'video/quicktime',
  'application/pdf',
];

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(process.env.UPLOAD_DIR || './uploads', 'mechanic', String(req.params.logId || 'tmp'));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`);
  },
});

const maxBytes = (parseInt(process.env.MAX_FILE_SIZE_MB) || 50) * 1024 * 1024;

module.exports = multer({
  storage,
  fileFilter: (req, file, cb) => {
    cb(ALLOWED.includes(file.mimetype) ? null : new Error(`Type ${file.mimetype} not allowed`), ALLOWED.includes(file.mimetype));
  },
  limits: { fileSize: maxBytes },
});
