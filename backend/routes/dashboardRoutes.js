const express = require('express');
const { cacheGet } = require('../utils/responseCache');
const router = express.Router();
const { getMetrics } = require('../controllers/dashboardController');

router.get('/metrics', cacheGet, getMetrics);

module.exports = router;