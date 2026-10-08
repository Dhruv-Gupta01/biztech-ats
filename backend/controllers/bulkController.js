const { parse } = require('csv-parse/sync');
const Candidate = require('../models/Candidate');
const Role = require('../models/Role');

const VALID_EMP_TYPES = ['Full-Time', 'Part-Time', 'Contract', 'Internship'];
const VALID_STATUSES = [
  'Information Form Response',
  'Interview 1',
  'Interview 1 Shortlisted',
  'Interview 2',
  'Interview 2 Shortlisted',
  'Assessment 1',
  'Assessment 1 Shortlisted',
  'Assessment 1 Passed',
  'Assessment 2',
  'Assessment 2 Shortlisted',
  'Assessment 2 Passed',
  'Final Round Shortlisted',
  'Selected',
  'Rejected'
];

const HEADER_MAP = {
  'Full Name': 'fullName',
  'Name': 'fullName',
  'Email': 'email',
  'Email Address': 'email',
  'Phone': 'phone',
  'Phone Number': 'phone',
  'Location': 'location',
  'Role Code': 'roleCode',
  'Role': 'roleCode',
  'Employment Type': 'employmentType',
  'Type': 'employmentType',
  'Years of Experience': 'yearsOfExperience',
  'Experience': 'yearsOfExperience',
  'Notice Period': 'noticePeriod',
  'Current CTC': 'ctcCurrent',
  'Expected CTC': 'ctcExpected',
  'Skills': 'skills',
  'Status': 'status',
  'Source': 'source',
  'Designation': 'designation',
  'Current Designation': 'designation',
  'Company': 'company',
  'Current Company': 'company',
  'Education': 'education',
  'Qualification': 'education'
};

function normalizeHeaders(records) {
  return records.map(row => {
    const normalized = {};
    for (const [key, value] of Object.entries(row)) {
      const trimmedKey = key.trim();
      const mappedKey = HEADER_MAP[trimmedKey] || trimmedKey;
      normalized[mappedKey] = value;
    }
    return normalized;
  });
}

function parseCsv(text) {
  let records;
  try {
    records = parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      delimiter: ','
    });
  } catch (err) {
    records = [];
  }

  const looksLikeCsv = records.length > 0 && Object.keys(records[0]).length > 1;
  if (!looksLikeCsv) {
    try {
      records = parse(text, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        delimiter: '\t'
      });
    } catch (err) {
      records = [];
    }
  }

  return normalizeHeaders(records);
}

// Expected CSV columns (header row required, order doesn't matter):
//   fullName, email, phone, location, roleCode, employmentType,
//   yearsOfExperience, ctcCurrent, ctcExpected, noticePeriod, skills, status, source,
//   designation, company, education
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
      records = parseCsv(req.file.buffer.toString('utf-8'));
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
      const status = VALID_STATUSES.includes(row.status) ? row.status : 'Information Form Response';
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
          designation: row.designation || '',
          company: row.company || '',
          education: row.education || '',
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

// POST /api/candidates/bulk-import-with-role
// Multipart form with:
// - `file`: CSV file
// - `roleCode`: string (applied to all rows, overrides any roleCode in CSV)
// Parses CSV and creates Candidate records in MongoDB.
exports.bulkImportWithRole = async (req, res) => {
  try {
    const { roleCode } = req.body;
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'CSV file is required (field name "file").' });
    }
    if (!roleCode) {
      return res.status(400).json({ success: false, message: 'roleCode is required.' });
    }

    const role = await Role.findOne({ code: roleCode.toUpperCase().trim() });
    if (!role) {
      return res.status(404).json({ success: false, message: `Role code "${roleCode}" not found.` });
    }

    let records;
    try {
      records = parseCsv(req.file.buffer.toString('utf-8'));
    } catch (parseErr) {
      return res.status(400).json({ success: false, message: `Could not parse CSV: ${parseErr.message}` });
    }

    if (records.length === 0) {
      return res.status(400).json({ success: false, message: 'CSV file has no data rows.' });
    }

    const results = { insertedCount: 0, skippedCount: 0, errors: [] };

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const rowNum = i + 2;

      const fullName = (row.fullName || '').trim();
      const email = (row.email || '').trim().toLowerCase();
      const phone = (row.phone || '').trim();
      const yearsOfExperience = row.yearsOfExperience;

      if (!fullName || !email || !phone || yearsOfExperience === undefined || yearsOfExperience === '') {
        results.skippedCount++;
        results.errors.push({ row: rowNum, reason: 'Missing required field (fullName, email, phone, or yearsOfExperience).' });
        continue;
      }

      const existing = await Candidate.findOne({ email });
      if (existing) {
        results.skippedCount++;
        results.errors.push({ row: rowNum, reason: `Duplicate email "${email}" — already exists, row skipped.` });
        continue;
      }

      const employmentType = VALID_EMP_TYPES.includes(row.employmentType) ? row.employmentType : 'Full-Time';
      const status = VALID_STATUSES.includes(row.status) ? row.status : 'Information Form Response';
      const skills = row.skills ? row.skills.split(';').map((s) => s.trim()).filter(Boolean) : [];

      try {
        await Candidate.create({
          fullName,
          email,
          phone,
          location: row.location || '',
          roleCode: roleCode.toUpperCase().trim(),
          employmentType,
          yearsOfExperience: Number(yearsOfExperience) || 0,
          ctcCurrent: Number(row.ctcCurrent) || 0,
          ctcExpected: Number(row.ctcExpected) || 0,
          noticePeriod: row.noticePeriod || '',
          skills,
          designation: row.designation || '',
          company: row.company || '',
          education: row.education || '',
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
      message: `Imported ${results.insertedCount} candidate(s) for role ${roleCode}, skipped ${results.skippedCount}.`,
      data: results
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error during CSV import with role.' });
  }
};