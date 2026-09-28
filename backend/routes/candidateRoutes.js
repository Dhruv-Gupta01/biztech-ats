const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const uploadCSV = require('../middleware/uploadCSV');
const { applyCandidate, getCandidates, scoreCandidate, updateCandidate, deleteCandidate, recordInterviewStage, analyzeCandidate, analyzeBulk, getResume, bulkUploadResumes } = require('../controllers/candidateController');
const { parseResume } = require('../controllers/resumeController');
const { bulkImportCandidates, bulkImportWithRole } = require('../controllers/bulkController');
const { upload: uploadMiddleware, bulkUpload } = require('../middleware/upload');

router.post('/parse-resume', uploadMiddleware.single('resume'), parseResume);
router.post('/bulk-import', uploadCSV.single('file'), bulkImportCandidates);
router.post('/bulk-import-with-role', uploadCSV.single('file'), bulkImportWithRole);
router.post('/apply', uploadMiddleware.single('resume'), applyCandidate);
router.post('/bulk-upload-resumes', bulkUpload.array('resumes', 50), bulkUploadResumes);
router.get('/', getCandidates);
router.post('/:id/score', scoreCandidate);
router.post('/:id/interview-stage', recordInterviewStage);
router.post('/:id/analyze', analyzeCandidate);
router.post('/analyze-bulk', analyzeBulk);
router.patch('/:id', updateCandidate);
router.delete('/:id', deleteCandidate);
router.get('/:id/resume', getResume);

module.exports = router;