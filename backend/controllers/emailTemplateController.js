const EmailTemplate = require('../models/emailTemplate');

/**
 * GET /api/templates
 * Get all email templates
 */
exports.getAllTemplates = async (req, res) => {
  try {
    const templates = await EmailTemplate.find().sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: templates });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error while fetching templates.' });
  }
};

/**
 * GET /api/templates/:id
 * Get a specific template by ID
 */
exports.getTemplateById = async (req, res) => {
  try {
    const template = await EmailTemplate.findById(req.params.id);
    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found.' });
    }
    return res.status(200).json({ success: true, data: template });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error while fetching template.' });
  }
};

/**
 * POST /api/templates
 * Create a new email template
 * Body: { name: string, subject: string, body: string }
 */
exports.createTemplate = async (req, res) => {
  try {
    const { name, subject, body, attachments } = req.body;
    
    if (!name || !subject || !body) {
      return res.status(400).json({ success: false, message: 'Name, subject, and body are required.' });
    }
    
    const template = new EmailTemplate({
      name,
      subject,
      body,
      attachments: Array.isArray(attachments) ? attachments : []
    });
    
    await template.save();
    return res.status(201).json({ success: true, message: 'Template created successfully.', data: template });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error while creating template.' });
  }
};

/**
 * PUT /api/templates/:id
 * Update an existing template
 * Body: { name: string, subject: string, body: string }
 */
exports.updateTemplate = async (req, res) => {
  try {
    const { name, subject, body, attachments } = req.body;
    
    if (!name || !subject || !body) {
      return res.status(400).json({ success: false, message: 'Name, subject, and body are required.' });
    }
    
    const template = await EmailTemplate.findByIdAndUpdate(
      req.params.id,
      { name, subject, body, attachments: Array.isArray(attachments) ? attachments : [] },
      { new: true, runValidators: true }
    );
    
    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found.' });
    }
    
    return res.status(200).json({ success: true, message: 'Template updated successfully.', data: template });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error while updating template.' });
  }
};

/**
 * DELETE /api/templates/:id
 * Delete a template
 */
exports.deleteTemplate = async (req, res) => {
  try {
    const template = await EmailTemplate.findByIdAndDelete(req.params.id);
    
    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found.' });
    }
    
    return res.status(200).json({ success: true, message: 'Template deleted successfully.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error while deleting template.' });
  }
};