const express = require('express');
const router = express.Router();
const { getStatus, runNow, listReviews, approveReview, dismissReview } = require('../controllers/etlController');

router.get('/status', getStatus);
router.post('/run', runNow);
router.get('/reviews', listReviews);
router.post('/reviews/:id/approve', approveReview);
router.post('/reviews/:id/dismiss', dismissReview);

module.exports = router;
