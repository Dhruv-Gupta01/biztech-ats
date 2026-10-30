const Role = require('../models/Role');
const { postJobToLinkedIn } = require('../services/linkedinService');
const { postJobToNaukri } = require('../services/naukriService');
const registry = require('../utils/employmentRegistry');
const { normalizeCriteria, normalizeJdWeight } = require('../utils/criteria');

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
    const { code, title, department, description, empType, openings, skills, minExperience, notNegotiable } = req.body;
    if (!code || !title || !department) {
      return res.status(400).json({ success: false, message: 'code, title and department are required.' });
    }
    const crit = normalizeCriteria(req.body.criteria);
    const jdw = normalizeJdWeight(req.body.jdWeight);
    if (crit.error || jdw.error) return res.status(400).json({ success: false, message: crit.error || jdw.error });

    const existing = await Role.findOne({ code: code.toUpperCase().trim() });
    if (existing) {
      return res.status(409).json({ success: false, message: `Role code "${code}" already exists.` });
    }

    const skillsArray = Array.isArray(skills) ? skills : skills ? String(skills).split(',').map((s) => s.trim()).filter(Boolean) : [];

    const normalizedCode = code.toUpperCase().trim();
    // Role-code prefix wins: a code starting with the prefix of a prefix-based
    // employment type (e.g. F → Freelance Coding) is always that type. Otherwise
    // honour the recruiter's explicit choice when it is a registered type.
    const prefixType = registry.resolveByPrefix(normalizedCode);
    const resolvedEmpType = prefixType
      || (empType && registry.isValidName(empType) ? empType : registry.getDefaultName());

    const role = await Role.create({
      code: normalizedCode,
      title,
      department,
      description: description || '',
      empType: resolvedEmpType,
      openings: Number(openings) || 1,
      skills: skillsArray,
      minExperience: Number(minExperience) || 0,
      notNegotiable: notNegotiable != null ? String(notNegotiable) : '',
      criteria: crit.criteria,
      jdWeight: jdw.jdWeight
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
// Any field except the code itself can be edited (the code is what candidates, Slack
// mappings and forms point at, so it is the fixed identifier).
exports.updateRole = async (req, res) => {
  try {
    const body = req.body || {};
    const updates = {};
    ['title', 'department', 'description'].forEach((f) => {
      if (body[f] !== undefined) updates[f] = String(body[f]);
    });
    if (updates.title !== undefined && !updates.title.trim()) return res.status(400).json({ success: false, message: 'Title cannot be empty.' });
    if (updates.department !== undefined && !updates.department.trim()) return res.status(400).json({ success: false, message: 'Department cannot be empty.' });

    if (body.skills !== undefined) {
      updates.skills = Array.isArray(body.skills) ? body.skills : String(body.skills).split(',').map((s) => s.trim()).filter(Boolean);
    }
    if (body.interviewStages !== undefined && Array.isArray(body.interviewStages)) updates.interviewStages = body.interviewStages;
    if (body.minExperience !== undefined) updates.minExperience = Number(body.minExperience) || 0;
    if (body.openings !== undefined) updates.openings = Number(body.openings) || 0;
    // notNegotiable is free text on the Role schema (not a boolean).
    if (body.notNegotiable !== undefined) updates.notNegotiable = body.notNegotiable == null ? '' : String(body.notNegotiable);
    if (body.status !== undefined) {
      if (!['Open', 'On-Hold', 'Closed'].includes(body.status)) return res.status(400).json({ success: false, message: 'Status must be Open, On-Hold or Closed.' });
      updates.status = body.status;
    }
    if (body.criteria !== undefined) {
      const crit = normalizeCriteria(body.criteria);
      if (crit.error) return res.status(400).json({ success: false, message: crit.error });
      updates.criteria = crit.criteria;
    }
    if (body.jdWeight !== undefined) {
      const jdw = normalizeJdWeight(body.jdWeight);
      if (jdw.error) return res.status(400).json({ success: false, message: jdw.error });
      updates.jdWeight = jdw.jdWeight;
    }

    const code = req.params.code.toUpperCase().trim();
    const prefixType = registry.resolveByPrefix(code);
    // Prefix rule is authoritative: if the role code matches a prefix-based
    // employment type, force that type regardless of what the request body says.
    if (prefixType) {
      updates.empType = prefixType;
    } else if (body.empType !== undefined) {
      if (!registry.isValidName(body.empType)) return res.status(400).json({ success: false, message: `Employment type "${body.empType}" is not registered.` });
      updates.empType = body.empType;
    }

    const role = await Role.findOneAndUpdate(
      { code: code },
      updates,
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