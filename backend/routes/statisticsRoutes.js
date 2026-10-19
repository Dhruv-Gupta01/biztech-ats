const express = require('express');
const router = express.Router();
const { getStatistics, exportStatisticsCSV } = require('../controllers/statisticsController');

router.get('/', getStatistics);
router.get('/export/csv', exportStatisticsCSV);

module.exports = router;
