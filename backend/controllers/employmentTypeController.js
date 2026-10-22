const EmploymentType = require('../models/EmploymentType');
const Role = require('../models/Role');
const Candidate = require('../models/Candidate');
const registry = require('../utils/employmentRegistry');

// GET /api/employment-types
// Public — the recruiter UI needs the list to render filters and the manage
// table. Returns active types ordered by sortOrder.
exports.getEmploymentTypes = async (req, res) => {
  try {
    const { includeInactive } = req.query;
    const query = includeInactive === 'true' ? {} : { isActive: true };
    const employmentTypes = await EmploymentType.find(query).sort({ sortOrder: 1, name: 1 });
    return res.status(200).json({ success: true, data: employmentTypes });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error while fetching employment types.' });
  }
};

// POST /api/employment-types
exports.createEmploymentType = async (req, res) => {
  try {
    const { name, label, isActive, isPrefixBased, prefix, sortOrder, description, isDefault } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, message: 'Name is required.' });
    }

    const trimmedName = String(name).trim();
    const existing = await EmploymentType.findOne({ name: trimmedName });
    if (existing) {
      return res.status(409).json({ success: false, message: `Employment type "${trimmedName}" already exists.` });
    }

    if (isPrefixBased && !prefix) {
      return res.status(400).json({ success: false, message: 'A prefix-based employment type must declare a prefix.' });
    }

    if (isDefault) {
      await EmploymentType.updateMany({}, { isDefault: false });
    }

    const employmentType = await EmploymentType.create({
      name: trimmedName,
      label: String(label || trimmedName).trim(),
      isActive: isActive !== false,
      isPrefixBased: isPrefixBased === true,
      prefix: isPrefixBased ? String(prefix || '').trim().toUpperCase() : null,
      sortOrder: Number(sortOrder) || 0,
      description: String(description || '').trim(),
      isDefault: isDefault === true
    });

    await registry.refreshEmploymentTypes();
    return res.status(201).json({ success: true, message: 'Employment type created.', data: employmentType });
  } catch (err) {
    console.error('[EmploymentTypes] create error:', err);
    return res.status(500).json({ success: false, message: 'Server error while creating employment type.' });
  }
};

// PATCH /api/employment-types/:name
exports.updateEmploymentType = async (req, res) => {
  try {
    const { name } = req.params;
    const updates = { ...req.body };

    const employmentType = await EmploymentType.findOne({ name: name.trim() });
    if (!employmentType) {
      return res.status(404).json({ success: false, message: 'Employment type not found.' });
    }

    if (updates.name && updates.name !== name) {
      const trimmedNewName = String(updates.name).trim();
      const existing = await EmploymentType.findOne({ name: trimmedNewName });
      if (existing) {
        return res.status(409).json({ success: false, message: `Employment type "${trimmedNewName}" already exists.` });
      }
      updates.name = trimmedNewName;
    }

    if (updates.isPrefixBased === true && !updates.prefix && !employmentType.prefix) {
      return res.status(400).json({ success: false, message: 'A prefix-based employment type must declare a prefix.' });
    }

    if (updates.isDefault) {
      await EmploymentType.updateMany({}, { isDefault: false });
    }

    const updated = await EmploymentType.findOneAndUpdate(
      { name: name.trim() },
      { ...updates, prefix: updates.isPrefixBased ? (String(updates.prefix || employmentType.prefix || '').trim().toUpperCase()) : null },
      { new: true, runValidators: true }
    );

    await registry.refreshEmploymentTypes();
    return res.status(200).json({ success: true, message: 'Employment type updated.', data: updated });
  } catch (err) {
    console.error('[EmploymentTypes] update error:', err);
    return res.status(500).json({ success: false, message: 'Server error while updating employment type.' });
  }
};

// DELETE /api/employment-types/:name
// Refuses to delete a type that is still referenced by existing roles or
// candidates, or the default type. Inactive types are soft-deleted (isActive
// false) rather than removed, so historical data keeps its value.
exports.deleteEmploymentType = async (req, res) => {
  try {
    const { name } = req.params;
    const trimmedName = String(name).trim();

    const employmentType = await EmploymentType.findOne({ name: trimmedName });
    if (!employmentType) {
      return res.status(404).json({ success: false, message: 'Employment type not found.' });
    }

    if (employmentType.isDefault) {
      return res.status(400).json({ success: false, message: 'Cannot delete the default employment type. Set another type as default first.' });
    }

    const referencedRoles = await Role.countDocuments({ empType: trimmedName });
    const referencedCandidates = await Candidate.countDocuments({ employmentType: trimmedName });

    if (referencedRoles > 0 || referencedCandidates > 0) {
      return res.status(409).json({
        success: false,
        message: `Cannot delete "${trimmedName}" — it is referenced by ${referencedRoles} role(s) and ${referencedCandidates} candidate(s). Reassign them first, or deactivate the type instead.`,
        referencedCount: { roles: referencedRoles, candidates: referencedCandidates }
      });
    }

    await EmploymentType.deleteOne({ _id: employmentType._id });
    await registry.refreshEmploymentTypes();
    return res.status(200).json({ success: true, message: `Employment type "${trimmedName}" deleted.` });
  } catch (err) {
    console.error('[EmploymentTypes] delete error:', err);
    return res.status(500).json({ success: false, message: 'Server error while deleting employment type.' });
  }
};

// PATCH /api/employment-types/:name/deactivate — soft delete, keeps historical data
exports.deactivateEmploymentType = async (req, res) => {
  try {
    const { name } = req.params;
    const trimmedName = String(name).trim();

    const employmentType = await EmploymentType.findOne({ name: trimmedName });
    if (!employmentType) {
      return res.status(404).json({ success: false, message: 'Employment type not found.' });
    }

    if (employmentType.isDefault) {
      return res.status(400).json({ success: false, message: 'Cannot deactivate the default employment type.' });
    }

    employmentType.isActive = false;
    await employmentType.save();
    await registry.refreshEmploymentTypes();
    return res.status(200).json({ success: true, message: `Employment type "${trimmedName}" deactivated.`, data: employmentType });
  } catch (err) {
    console.error('[EmploymentTypes] deactivate error:', err);
    return res.status(500).json({ success: false, message: 'Server error while deactivating employment type.' });
  }
};