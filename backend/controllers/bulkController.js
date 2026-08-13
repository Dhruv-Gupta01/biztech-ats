const { parse } = require('csv-parse/sync');
const Candidate = require('../models/Candidate');

const VALID_EMP_TYPES = ['Full-Time', 'Part-Time', 'Contract', 'Internship'];
const VALID_STATUSES = ['Applied', 'Screened', 'Shortlisted', 'Interviewing', 'Rejected', 'Hired'];

// Expected CSV columns (header row required, order doesn't matter):
//   fullName, email, phone, location, roleCode, employmentType,
//   yearsOfExperience, ctcCurrent, ctcExpected, noticePeriod, skills, status, source
// - skills: semicolon-separated within the cell, e.g. "React;Node.js;MongoDB"
// - employmentType/status: invalid or blank values fall back to safe defaults
// - resumeUrl is intentionally not a column — bulk-imported candidates have no
//   uploaded PDF; resumeUrl stays blank for them (schema allows this)

// POST /api/candidates/bulk-import
exports.bulkImportCandidates = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'CSV file is required (field name "file").' });
    }

    let records;
    try {
      records = parse(req.file.buffer.toString('utf-8'), {
        columns: true,
        skip_empty_lines: true,
        trim: true
      });
    } catch (parseErr) {
      return res.status(400).json({ success: false, message: `Could not parse CSV: ${parseErr.message}` });
    }

    if (records.length === 0) {
      return res.status(400).json({ success: false, message: 'CSV file has no data rows.' });
    }

    const results = { insertedCount: 0, skippedCount: 0, errors: [] };

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const rowNum = i + 2; // +2 = header row + 1-indexing, matches the row number in a spreadsheet

      const fullName = (row.fullName || '').trim();
      const email = (row.email || '').trim().toLowerCase();
      const phone = (row.phone || '').trim();
      const roleCode = (row.roleCode || '').trim().toUpperCase();
      const yearsOfExperience = row.yearsOfExperience;

      if (!fullName || !email || !phone || !roleCode || yearsOfExperience === undefined || yearsOfExperience === '') {
        results.skippedCount++;
        results.errors.push({ row: rowNum, reason: 'Missing required field (fullName, email, phone, roleCode, or yearsOfExperience).' });
        continue;
      }

      const existing = await Candidate.findOne({ email });
      if (existing) {
        results.skippedCount++;
        results.errors.push({ row: rowNum, reason: `Duplicate email "${email}" — already exists, row skipped.` });
        continue;
      }

      const employmentType = VALID_EMP_TYPES.includes(row.employmentType) ? row.employmentType : 'Full-Time';
      const status = VALID_STATUSES.includes(row.status) ? row.status : 'Applied';
      const skills = row.skills ? row.skills.split(';').map((s) => s.trim()).filter(Boolean) : [];

      try {
        await Candidate.create({
          fullName,
          email,
          phone,
          location: row.location || '',
          roleCode,
          employmentType,
          yearsOfExperience: Number(yearsOfExperience) || 0,
          ctcCurrent: Number(row.ctcCurrent) || 0,
          ctcExpected: Number(row.ctcExpected) || 0,
          noticePeriod: row.noticePeriod || '',
          skills,
          resumeUrl: '',
          status,
          source: row.source || 'CSV Import'
        });
        results.insertedCount++;
      } catch (createErr) {
        results.skippedCount++;
        results.errors.push({ row: rowNum, reason: createErr.message });
      }
    }

    return res.status(201).json({
      success: true,
      message: `Imported ${results.insertedCount} candidate(s), skipped ${results.skippedCount}.`,
      data: results
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error during CSV import.' });
  }
};