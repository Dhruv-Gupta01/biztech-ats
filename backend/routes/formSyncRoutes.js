const express = require('express');
const router = express.Router();
const { getStatus, runNow, listForms, createForm, updateForm, deleteForm } = require('../controllers/formSyncController');

router.get('/status', getStatus);
router.post('/run', runNow);
router.get('/forms', listForms);
router.post('/forms', createForm);
router.patch('/forms/:id', updateForm);
router.delete('/forms/:id', deleteForm);

module.exports = router;
