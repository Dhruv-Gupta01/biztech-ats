const express = require('express');
const router = express.Router();
const { sendOutreach, uploadAttachments, deleteAttachment, listAttachments } = require('../controllers/outreachController');
const { uploadAttachments: upload } = require('../middleware/upload');

// Files from a recruiter's device are stored first (multipart), then referenced
// by id when the email is actually sent — keeps the send request a small JSON
// payload instead of re-uploading the same bytes on every retry.
router.post('/attachments', upload.array('files', 10), uploadAttachments);
router.get('/attachments', listAttachments);
router.delete('/attachments/:id', deleteAttachment);

router.post('/send', sendOutreach);

module.exports = router;
