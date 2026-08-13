const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const uploadCSV = require('../middleware/uploadCSV');
const { applyCandidate, getCandidates, scoreCandidate, updateCandidate, deleteCandidate, recordInterviewStage } = require('../controllers/candidateController');
const { parseResume } = require('../controllers/resumeController');
const { bulkImportCandidates } = require('../controllers/bulkController');

router.post('/parse-resume', upload.single('resume'), parseResume);
router.post('/bulk-import', uploadCSV.single('file'), bulkImportCandidates);
router.post('/apply', upload.single('resume'), applyCandidate);
router.get('/', getCandidates);
router.post('/:id/score', scoreCandidate);
router.post('/:id/interview-stage', recordInterviewStage);
router.patch('/:id', updateCandidate);
router.delete('/:id', deleteCandidate);

module.exports = router;