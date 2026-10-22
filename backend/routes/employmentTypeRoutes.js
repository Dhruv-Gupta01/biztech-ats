const express = require('express');
const router = express.Router();
const {
  getEmploymentTypes,
  createEmploymentType,
  updateEmploymentType,
  deleteEmploymentType,
  deactivateEmploymentType
} = require('../controllers/employmentTypeController');

router.get('/', getEmploymentTypes);
router.post('/', createEmploymentType);
router.patch('/:name', updateEmploymentType);
router.delete('/:name', deleteEmploymentType);
router.patch('/:name/deactivate', deactivateEmploymentType);

module.exports = router;