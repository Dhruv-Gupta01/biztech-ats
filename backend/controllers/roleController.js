const Role = require('../models/Role');
const { postJobToLinkedIn } = require('../services/linkedinService');
const { postJobToNaukri } = require('../services/naukriService');

// GET /api/roles
exports.getRoles = async (req, res) => {
  try {
    const roles = await Role.find().sort({ createdAt: -1 });
    return res.status(200).json({ success: true, count: roles.length, data: roles });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error while fetching roles.' });
  }
};

// POST /api/roles
// Creates the role, then immediately attempts to post the same job to LinkedIn.
// The LinkedIn call never blocks or fails role creation — its outcome is reported
// back in the `linkedin` field so the UI can show a status without needing a second request.
exports.createRole = async (req, res) => {
  try {
    const { code, title, department, description, empType, openings } = req.body;
    if (!code || !title || !department) {
      return res.status(400).json({ success: false, message: 'code, title and department are required.' });
    }

    const existing = await Role.findOne({ code: code.toUpperCase().trim() });
    if (existing) {
      return res.status(409).json({ success: false, message: `Role code "${code}" already exists.` });
    }

    const role = await Role.create({
      code: code.toUpperCase().trim(),
      title,
      department,
      description: description || '',
      empType,
      openings: Number(openings) || 1
    });

    const [linkedin, naukri] = await Promise.all([
      postJobToLinkedIn({ title: role.title, description: role.description, employmentType: role.empType }),
      postJobToNaukri({ title: role.title, description: role.description, employmentType: role.empType, department: role.department })
    ]);

    const postedSomewhere = linkedin.posted || naukri.posted;
    const skippedParts = [];
    if (!linkedin.posted) skippedParts.push(`LinkedIn: ${linkedin.reason}`);
    if (!naukri.posted) skippedParts.push(`Naukri: ${naukri.reason}`);

    return res.status(201).json({
      success: true,
      message: postedSomewhere
        ? `Role created. ${linkedin.posted ? 'Posted to LinkedIn. ' : ''}${naukri.posted ? 'Posted to Naukri.' : ''}`.trim()
        : `Role created. Job board posts skipped — ${skippedParts.join(' | ')}`,
      data: role,
      linkedin,
      naukri
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error while creating role.' });
  }
};

// PATCH /api/roles/:code
exports.updateRole = async (req, res) => {
  try {
    const role = await Role.findOneAndUpdate(
      { code: req.params.code.toUpperCase() },
      req.body,
      { new: true, runValidators: true }
    );
    if (!role) return res.status(404).json({ success: false, message: 'Role not found.' });
    return res.status(200).json({ success: true, message: 'Role updated.', data: role });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error while updating role.' });
  }
};

// DELETE /api/roles/:code
exports.deleteRole = async (req, res) => {
  try {
    const role = await Role.findOneAndDelete({ code: req.params.code.toUpperCase() });
    if (!role) return res.status(404).json({ success: false, message: 'Role not found.' });
    return res.status(200).json({ success: true, message: 'Role removed.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error while deleting role.' });
  }
};