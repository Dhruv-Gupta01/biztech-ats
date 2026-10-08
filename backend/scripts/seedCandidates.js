const mongoose = require('mongoose');
const { parse } = require('csv-parse/sync');
const Candidate = require('../models/Candidate');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config();

const CSV_PATH = process.argv[2] || path.join(__dirname, '..', 'seed', 'candidates.csv');
const MONGO_URI = process.env.MONGO_URI;

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
  'Source': 'source'
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

function parseNumeric(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const num = Number(value);
  return Number.isNaN(num) ? fallback : num;
}

function parseSkills(value) {
  if (!value) return [];
  const str = String(value);
  if (str.includes(';')) return str.split(';').map((s) => s.trim()).filter(Boolean);
  if (str.includes(',')) return str.split(',').map((s) => s.trim()).filter(Boolean);
  return [str.trim()].filter(Boolean);
}

function determineDatabaseType(uri) {
  if (!uri) return 'unknown';
  const lower = uri.toLowerCase();
  if (lower.includes('/ats_dev') || lower.includes('ats_dev?')) return 'DEV';
  if (lower.includes('/ats_prod') || lower.includes('ats_prod?')) return 'PROD';
  return 'unknown';
}

async function main() {
  if (!MONGO_URI) {
    console.error('❌ MONGO_URI is not defined. Check your .env file.');
    process.exit(1);
  }

  const dbType = determineDatabaseType(MONGO_URI);
  if (dbType === 'PROD') {
    console.error('❌ BLOCKED: This script is not allowed to run against the production database (ats_prod).');
    console.error('   Set MONGO_URI to a DEV database (ats_dev) before running this script.');
    process.exit(1);
  }

  if (dbType === 'unknown') {
    console.warn('⚠️  WARNING: Could not determine if MONGO_URI points to DEV or PROD.');
    console.warn('   This script is intended for DEV databases only.');
    const answer = await new Promise((resolve) => {
      process.stdout.write('   Continue anyway? (yes/no): ');
      process.stdin.once('data', (d) => resolve(d.toString().trim().toLowerCase()));
    });
    if (answer !== 'yes' && answer !== 'y') {
      console.log('Aborted.');
      process.exit(0);
    }
  }

  if (!fs.existsSync(CSV_PATH)) {
    console.error(`❌ CSV file not found: ${CSV_PATH}`);
    console.error('   Usage: node scripts/seedCandidates.js [path/to/candidates.csv]');
    process.exit(1);
  }

  const csvText = fs.readFileSync(CSV_PATH, 'utf-8');
  let records;
  try {
    records = parseCsv(csvText);
  } catch (err) {
    console.error(`❌ Could not parse CSV: ${err.message}`);
    process.exit(1);
  }

  if (records.length === 0) {
    console.error('❌ CSV file has no data rows.');
    process.exit(1);
  }

  console.log(`📄 Loaded ${records.length} row(s) from ${CSV_PATH}`);
  console.log(`🔗 Connecting to MongoDB...`);

  try {
    await mongoose.connect(MONGO_URI);
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  }

  const dbName = mongoose.connection.db.databaseName;
  console.log(`✅ Connected to database: ${dbName}`);

  let insertedCount = 0;
  let skippedCount = 0;
  const errors = [];

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    const rowNum = i + 2;

    const fullName = (row.fullName || '').trim();
    const email = (row.email || '').trim().toLowerCase();
    const phone = (row.phone || '').trim();
    const roleCode = (row.roleCode || '').trim().toUpperCase();
    const yearsOfExperience = row.yearsOfExperience;

    if (!fullName || !email || !phone || !roleCode || yearsOfExperience === undefined || yearsOfExperience === '') {
      skippedCount++;
      errors.push({ row: rowNum, reason: 'Missing required field (fullName, email, phone, roleCode, or yearsOfExperience).' });
      continue;
    }

    const existing = await Candidate.findOne({ email });
    if (existing) {
      skippedCount++;
      errors.push({ row: rowNum, reason: `Duplicate email "${email}" — already exists, row skipped.` });
      continue;
    }

    const employmentType = VALID_EMP_TYPES.includes(row.employmentType) ? row.employmentType : 'Full-Time';
    const status = VALID_STATUSES.includes(row.status) ? row.status : 'Information Form Response';
    const skills = parseSkills(row.skills);

    try {
      await Candidate.create({
        fullName,
        email,
        phone,
        location: row.location || '',
        roleCode,
        employmentType,
        yearsOfExperience: parseNumeric(yearsOfExperience),
        ctcCurrent: parseNumeric(row.ctcCurrent),
        ctcExpected: parseNumeric(row.ctcExpected),
        noticePeriod: row.noticePeriod || '',
        skills,
        resumeUrl: '',
        status,
        source: row.source || 'CSV Import'
      });
      insertedCount++;
    } catch (err) {
      skippedCount++;
      errors.push({ row: rowNum, reason: err.message });
    }
  }

  console.log('\n=== Seed Summary ===');
  console.log(`Database:     ${dbName} (${dbType || 'unknown'})`);
  console.log(`Inserted:     ${insertedCount}`);
  console.log(`Skipped:      ${skippedCount}`);
  if (errors.length > 0) {
    console.log('\nErrors/Skipped details:');
    errors.forEach((e) => console.log(`  Row ${e.row}: ${e.reason}`));
  }
  console.log('====================\n');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Seed script failed:', err);
  process.exit(1);
});
