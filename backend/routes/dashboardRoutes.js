const express = require('express');
const router = express.Router();
const { getMetrics } = require('../controllers/dashboardController');

router.get('/metrics', getMetrics);

module.exports = router;