const express = require('express');
const router = express.Router();
const { getMappings, createMapping, updateMapping, deleteMapping, bulkAssignToSlackGroup } = require('../controllers/slackController');

router.get('/', getMappings);
router.post('/', createMapping);
router.post('/assign', bulkAssignToSlackGroup);
router.patch('/:id', updateMapping);
router.delete('/:id', deleteMapping);

module.exports = router;