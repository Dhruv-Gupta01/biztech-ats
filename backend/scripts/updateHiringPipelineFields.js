// One-off follow-up to importHiringPipeline.js: re-applies ONLY the Calendly link sent /
// Calendly status / project / project status mapping (see hiringPipelineToJson.py) to
// candidates that are already in the ATS, matched by email. Nothing else on the record
// is touched, and candidates not in the ATS are ignored.
//
// DRY RUN by default (no DB connection). Pass --commit to write; it also makes sure the
// "Prolific" project exists. Project / project status are only set for rows that have an
// IDV value, so manual project edits on other candidates are left alone.
//
// Usage:
//   node scripts/updateHiringPipelineFields.js /path/outside/repo/candidates.json
//   node scripts/updateHiringPipelineFields.js /path/outside/repo/candidates.json --commit
const fs = require('fs');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const Candidate = require('../models/Candidate');
const Project = require('../models/Project');

const BATCH_SIZE = 500;

async function run() {
  const args = process.argv.slice(2);
  const commit = args.includes('--commit');
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('Usage: node scripts/updateHiringPipelineFields.js <candidates.json> [--commit]');
    process.exit(1);
  }

  const docs = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const ops = docs.map((d) => {
    const set = { calendlyLinkSent: d.calendlyLinkSent, calendlyLinkStatus: d.calendlyLinkStatus };
    if (d.project) {
      set.project = d.project;
      set.projectStatus = d.projectStatus;
    }
    return { updateOne: { filter: { email: d.email }, update: { $set: set } } };
  });
  console.log(`Read ${docs.length} rows; ${docs.filter((d) => d.project).length} with a project (IDV)`);

  if (!commit) {
    console.log('DRY RUN — nothing written. Re-run with --commit to update.');
    return;
  }
  if (!process.env.MONGO_URI) {
    console.error('❌ MONGO_URI is not defined');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`✅ Connected to database: ${mongoose.connection.db.databaseName}`);

  if (!(await Project.findOne({ name: 'Prolific' }))) {
    await Project.create({ name: 'Prolific' });
    console.log('  + project "Prolific" added');
  }

  let matched = 0;
  let modified = 0;
  for (let i = 0; i < ops.length; i += BATCH_SIZE) {
    const res = await Candidate.bulkWrite(ops.slice(i, i + BATCH_SIZE), { ordered: false });
    matched += res.matchedCount;
    modified += res.modifiedCount;
    console.log(`  ${Math.min(i + BATCH_SIZE, ops.length)}/${ops.length} processed`);
  }
  console.log(`\nMatched in ATS: ${matched}, updated: ${modified}, not in ATS: ${ops.length - matched}`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Update failed:', err);
  process.exit(1);
});
