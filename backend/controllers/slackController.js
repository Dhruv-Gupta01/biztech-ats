const SlackMapping = require('../models/SlackMapping');
const Candidate = require('../models/Candidate');
const { buildHistoryEntries } = require('../utils/history');
// GET /api/slack-mappings
exports.getMappings = async (req, res) => {
  try {
    const mappings = await SlackMapping.find().sort({ createdAt: -1 });
    return res.status(200).json({ success: true, count: mappings.length, data: mappings });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error while fetching Slack mappings.' });
  }
};

// POST /api/slack-mappings
exports.createMapping = async (req, res) => {
  try {
    const { roleCode, channel, webhook } = req.body;
    if (!roleCode || !channel || !webhook) {
      return res.status(400).json({ success: false, message: 'roleCode, channel and webhook are required.' });
    }
    const mapping = await SlackMapping.create({ roleCode: roleCode.toUpperCase().trim(), channel, webhook });
    return res.status(201).json({ success: true, message: 'Slack mapping created.', data: mapping });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error while creating Slack mapping.' });
  }
};

// PATCH /api/slack-mappings/:id  (toggle active / edit)
exports.updateMapping = async (req, res) => {
  try {
    const mapping = await SlackMapping.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!mapping) return res.status(404).json({ success: false, message: 'Mapping not found.' });
    return res.status(200).json({ success: true, message: 'Mapping updated.', data: mapping });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error while updating mapping.' });
  }
};

// DELETE /api/slack-mappings/:id
exports.deleteMapping = async (req, res) => {
  try {
    const mapping = await SlackMapping.findByIdAndDelete(req.params.id);
    if (!mapping) return res.status(404).json({ success: false, message: 'Mapping not found.' });
    return res.status(200).json({ success: true, message: 'Mapping removed.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error while deleting mapping.' });
  }
};
// POST /api/slack-mappings/assign
// Bulk-assigns a set of candidates to a Slack group: updates each candidate's
// slackGroup field (with a history entry), then posts one real message to the
// mapping's Slack webhook listing who was just added. DB updates always happen;
// the Slack POST is best-effort and its outcome is reported back separately so
// a failed webhook doesn't look like the whole action failed.
exports.bulkAssignToSlackGroup = async (req, res) => {
  try {
    const { candidateIds, slackMappingId, changedBy } = req.body;
    if (!Array.isArray(candidateIds) || candidateIds.length === 0) {
      return res.status(400).json({ success: false, message: 'candidateIds must be a non-empty array.' });
    }
    if (!slackMappingId) {
      return res.status(400).json({ success: false, message: 'slackMappingId is required.' });
    }

    const mapping = await SlackMapping.findById(slackMappingId);
    if (!mapping) {
      return res.status(404).json({ success: false, message: 'Slack mapping not found.' });
    }
    if (!mapping.active) {
      return res.status(400).json({ success: false, message: `The "${mapping.channel}" mapping is paused — activate it first.` });
    }

    const candidates = await Candidate.find({ _id: { $in: candidateIds } });
    if (candidates.length === 0) {
      return res.status(404).json({ success: false, message: 'No matching candidates found.' });
    }

    for (const candidate of candidates) {
      const historyEntries = buildHistoryEntries(candidate, { slackGroup: mapping.channel }, changedBy);
      candidate.slackGroup = mapping.channel;
      candidate.history.push(...historyEntries);
      candidate.updatedAt = new Date();
      await candidate.save();
    }

    const names = candidates.map((c) => `${c.fullName} (${c.roleCode})`).join(', ');
    const slackMessage = {
      text: `👋 ${candidates.length} candidate(s) added to *${mapping.channel}*: ${names}`
    };

    let slackPosted = false;
    let slackError = null;
    try {
      const slackRes = await fetch(mapping.webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slackMessage)
      });
      slackPosted = slackRes.ok;
      if (!slackRes.ok) slackError = `Slack responded with status ${slackRes.status}`;
    } catch (err) {
      slackError = err.message;
    }

    return res.status(200).json({
      success: true,
      message: slackPosted
        ? `${candidates.length} candidate(s) assigned to ${mapping.channel} and Slack notified.`
        : `${candidates.length} candidate(s) assigned to ${mapping.channel} in the database, but the Slack message failed: ${slackError}`,
      data: { updatedCount: candidates.length, slackPosted, slackError }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error while assigning candidates to Slack group.' });
  }
};