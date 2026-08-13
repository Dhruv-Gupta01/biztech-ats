const multer = require('multer');

// CSV parsing happens entirely in memory (no disk write needed) — the buffer
// is handed straight to csv-parse in bulkController.js.
const fileFilter = (req, file, cb) => {
  const okTypes = ['text/csv', 'application/vnd.ms-excel', 'application/csv', 'text/plain'];
  if (okTypes.includes(file.mimetype) || file.originalname.toLowerCase().endsWith('.csv')) {
    cb(null, true);
  } else {
    cb(new Error('ONLY_CSV_ALLOWED'), false);
  }
};

const uploadCSV = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB — raise further if HR's exports are larger
});

module.exports = uploadCSV;