const express = require('express');
const { cacheGet } = require('../utils/responseCache');
const router = express.Router();
const { getStatistics, exportStatisticsCSV } = require('../controllers/statisticsController');

router.get('/', cacheGet, getStatistics);
router.get('/export/csv', exportStatisticsCSV);

module.exports = router;
