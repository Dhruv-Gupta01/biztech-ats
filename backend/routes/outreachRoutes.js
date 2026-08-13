const express = require('express');
const router = express.Router();
const { sendOutreach } = require('../controllers/outreachController');

router.post('/send', sendOutreach);

module.exports = router;