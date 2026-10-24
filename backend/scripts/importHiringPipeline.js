// One-off import of the Hiring Pipeline Master "Candidate Master" tab.
//
// Input is the JSON produced by scripts/hiringPipelineToJson.py (that script owns
// every column mapping decision). This script only validates and writes.
//
// DRY RUN by default: validates every row against the Candidate schema and prints
// a report, without connecting to MongoDB or writing anything. Pass --commit to
// write. Safe to re-run — candidates whose email already exists are skipped, so
// nothing is duplicated or overwritten.
//
// On --commit it also makes sure the pieces the data refers to exist:
//   - employment types "Freelance" and "Freelance/Contract" (added to the registry)
//   - role CODING (created directly on the model, so no LinkedIn/Naukri posting fires)
// Rows are inserted with insertMany (schema validation runs, pre-save hooks don't) —
// fine here because CODING carries no F/M prefix rule.
//
// Usage:
//   node scripts/importHiringPipeline.js /path/outside/repo/candidates.json
//   node scripts/importHiringPipeline.js /path/outside/repo/candidates.json --commit
const fs = require('fs');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const Candidate = require('../models/Candidate');
const Role = require('../models/Role');
const EmploymentType = require('../models/EmploymentType');
const registry = require('../utils/employmentRegistry');

const BATCH_SIZE = 500;

const NEW_EMPLOYMENT_TYPES = [
  { name: 'Freelance', label: 'Freelance', isPrefixBased: false, prefix: null, sortOrder: 7, description: 'Freelance engagement (any role code)', isDefault: false },
  { name: 'Freelance/Contract', label: 'Freelance/Contract', isPrefixBased: false, prefix: null, sortOrder: 8, description: 'Open to freelance or contract (any role code)', isDefault: false }
];

const CODING_ROLE = {
  code: 'CODING',
  title: 'Coding',
  department: 'Engineering',
  description: 'Coding hiring pipeline (freelance / contract).',
  empType: 'Freelance/Contract',
  openings: 0
};

function tally(docs, field) {
  const counts = {};
  docs.forEach((d) => {
    const key = d[field] === null || d[field] === undefined || d[field] === '' ? '(blank)' : d[field];
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
}

async function run() {
  const args = process.argv.slice(2);
  const commit = args.includes('--commit');
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('Usage: node scripts/importHiringPipeline.js <candidates.json> [--commit]');
    process.exit(1);
  }

  const docs = JSON.parse(fs.readFileSync(file, 'utf-8'));
  console.log(`Read ${docs.length} candidates from ${file}`);

  // Validate every row up front so a bad row is reported, not discovered mid-insert.
  const invalid = [];
  docs.forEach((d, i) => {
    const err = new Candidate(d).validateSync();
    if (err) invalid.push({ row: i, email: d.email, reason: Object.values(err.errors).map((e) => e.message).join('; ') });
  });
  console.log(`Schema validation: ${docs.length - invalid.length} valid, ${invalid.length} invalid`);
  invalid.slice(0, 10).forEach((r) => console.log(`  ✗ ${r.email}: ${r.reason}`));

  ['employmentType', 'status', 'cvScreening', 'screeningInterview', 'calendlyLinkSent', 'calendlyLinkStatus',
    'ndaIca', 'slackStatus', 'bootcampAttempts', 'bootcampStatus', 'onboarding'].forEach((field) => {
    console.log(`\n${field}:`, tally(docs, field));
  });
  console.log('\nphone "N/A":', docs.filter((d) => d.phone === 'N/A').length);
  console.log('yearsOfExperience = 0:', docs.filter((d) => d.yearsOfExperience === 0).length);
  console.log('with resume link:', docs.filter((d) => d.resumeUrl).length);

  if (!commit) {
    console.log('\nDRY RUN — nothing written. Re-run with --commit to import.');
    return;
  }

  if (!process.env.MONGO_URI) {
    console.error('❌ MONGO_URI is not defined');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`\n✅ Connected to database: ${mongoose.connection.db.databaseName}`);

  for (const type of NEW_EMPLOYMENT_TYPES) {
    const exists = await EmploymentType.findOne({ name: type.name });
    if (!exists) {
      await EmploymentType.create({ ...type, isActive: true });
      console.log(`  + employment type "${type.name}" added`);
    }
  }
  await registry.refreshEmploymentTypes();

  if (!(await Role.findOne({ code: CODING_ROLE.code }))) {
    await Role.create(CODING_ROLE);
    console.log(`  + role ${CODING_ROLE.code} created`);
  }

  const invalidEmails = new Set(invalid.map((r) => r.email));
  const candidates = docs.filter((d) => !invalidEmails.has(d.email));

  let inserted = 0;
  let alreadyExisted = 0;
  const failures = [];
  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    const existing = new Set(
      (await Candidate.find({ email: { $in: batch.map((d) => d.email) } }, { email: 1 }).lean()).map((c) => c.email)
    );
    const fresh = batch.filter((d) => !existing.has(d.email));
    alreadyExisted += batch.length - fresh.length;
    if (fresh.length) {
      try {
        const res = await Candidate.insertMany(fresh, { ordered: false });
        inserted += res.length;
      } catch (err) {
        inserted += err.insertedDocs ? err.insertedDocs.length : 0;
        failures.push(err.message);
      }
    }
    console.log(`  ${Math.min(i + BATCH_SIZE, candidates.length)}/${candidates.length} processed`);
  }

  console.log(`\nInserted: ${inserted}`);
  console.log(`Skipped (email already in ATS): ${alreadyExisted}`);
  console.log(`Failed validation: ${invalid.length}`);
  if (failures.length) console.log('Batch errors:', failures.slice(0, 5));
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
