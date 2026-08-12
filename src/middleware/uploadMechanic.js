const multer = require('multer');
const path = require('path');
const fs = require('fs');

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

const maxBytes = (parseInt(process.env.MAX_FILE_SIZE_MB) || 200) * 1024 * 1024;

module.exports = multer({
  storage,
  limits: { fileSize: maxBytes },
});
