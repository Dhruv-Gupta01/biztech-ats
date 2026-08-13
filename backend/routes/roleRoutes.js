const express = require('express');
const router = express.Router();
const { getRoles, createRole, updateRole, deleteRole } = require('../controllers/roleController');

router.get('/', getRoles);
router.post('/', createRole);
router.patch('/:code', updateRole);
router.delete('/:code', deleteRole);

module.exports = router;