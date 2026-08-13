const express = require('express');
const router = express.Router();
const { getStatus, runNow } = require('../controllers/retentionController');

router.get('/status', getStatus);
router.post('/run', runNow);

module.exports = router;