const Candidate = require('../models/Candidate');
const FormSyncRun = require('../models/FormSyncRun');
const GoogleForm = require('../models/GoogleForm');
const { syncFormResponses, isConfigured, configurationReason } = require('../services/formSyncService');

// GET /api/form-sync/status
exports.getStatus = async (req, res) => {
  try {
    const [lastRun, submittedCount, activeForms] = await Promise.all([
      FormSyncRun.findOne().sort({ createdAt: -1 }),
      Candidate.countDocuments({ 'formSubmissions.submittedAt': { $ne: null } }),
      GoogleForm.find({ isActive: true })
    ]);
    return res.status(200).json({
      success: true,
      data: {
        enabled: process.env.FORM_SYNC_ENABLED === 'true',
        configured: isConfigured(),
        configReason: isConfigured() ? null : configurationReason(),
        lastRun,
        submittedCount,
        activeForms
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error while fetching form sync status.' });
  }
};

// POST /api/form-sync/run
exports.runNow = async (req, res) => {
  try {
    const result = await syncFormResponses();
    return res.status(200).json({ success: true, message: result.message || result.reason || 'Sync complete.', data: result });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error while syncing form responses.' });
  }
};

// GET /api/form-sync/forms
exports.listForms = async (req, res) => {
  try {
    const forms = await GoogleForm.find().sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: forms });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error while fetching forms.' });
  }
};

// POST /api/form-sync/forms
exports.createForm = async (req, res) => {
  try {
    const form = await GoogleForm.create(req.body);
    return res.status(201).json({ success: true, data: form });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error while creating form.' });
  }
};

// PATCH /api/form-sync/forms/:id
exports.updateForm = async (req, res) => {
  try {
    const form = await GoogleForm.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!form) return res.status(404).json({ success: false, message: 'Form not found.' });
    return res.status(200).json({ success: true, data: form });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error while updating form.' });
  }
};

// DELETE /api/form-sync/forms/:id
exports.deleteForm = async (req, res) => {
  try {
    const form = await GoogleForm.findByIdAndDelete(req.params.id);
    if (!form) return res.status(404).json({ success: false, message: 'Form not found.' });
    return res.status(200).json({ success: true, message: 'Form deleted.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error while deleting form.' });
  }
};
