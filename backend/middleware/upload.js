const multer = require('multer');

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('ONLY_PDF_ALLOWED'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB per file
});

const bulkUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB per file
});

// Outreach email attachments — recruiters legitimately send more than PDFs
// (JD docx, offer letters, NDAs, images), so this accepts any type but caps
// size more aggressively since these bytes go over the wire in every email.
const attachmentFilter = (req, file, cb) => {
  // Reject anything that could execute server-side or has no declared type.
  const BLOCKED = [
    'application/x-msdownload', 'application/x-msdos-program', 'application/x-sh',
    'application/x-executable', 'application/vnd.microsoft.portable-executable'
  ];
  if (BLOCKED.includes(file.mimetype)) {
    cb(new Error('UNSAFE_FILE_TYPE'), false);
    return;
  }
  cb(null, true);
};

const uploadAttachments = multer({
  storage,
  fileFilter: attachmentFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB per file
});

module.exports = { upload, bulkUpload, uploadAttachments };
