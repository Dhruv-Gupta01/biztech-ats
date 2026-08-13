const express = require('express');
const router = express.Router();
const { getStatus, runNow } = require('../controllers/formSyncController');

router.get('/status', getStatus);
router.post('/run', runNow);

module.exports = router;
