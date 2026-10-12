// One-shot migration: every existing Role whose code starts with "F" and every
// existing Candidate whose roleCode starts with "F" is FREELANCE CODING.
//
// Runs against the live DB (MONGO_URI in .env). Safe to re-run — it only writes
// rows that are not already correct. The Candidate/Role models keep enforcing
// this rule at runtime (pre-save + post-init hooks and role create/update), so
// this script only needs to run once to backfill historical data.
//
// Usage: node scripts/migrateFreelance.js
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const Candidate = require('../models/Candidate');
const Role = require('../models/Role');

const MONGO_URI = process.env.MONGO_URI;
const FREELANCE_EMP_TYPE = 'FREELANCE CODING';

// Matches any code starting with F (case-insensitive), e.g. F-TYPESCRIPT, FTE-001.
const F_CODE_REGEX = /^F/i;

async function migrate() {
  if (!MONGO_URI) {
    console.error('❌ MONGO_URI is not defined in .env');
    process.exit(1);
  }

  console.log('🔗 Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  const dbName = mongoose.connection.db.databaseName;
  console.log(`✅ Connected to database: ${dbName}`);

  // --- Roles ---
  const roles = await Role.find({});
  const rolesToFix = roles.filter((r) => F_CODE_REGEX.test(r.code || '') && r.empType !== FREELANCE_EMP_TYPE);
  console.log(`\n📦 Roles: ${roles.length} total, ${roles.length - rolesToFix.length} already FREELANCE CODING, ${rolesToFix.length} to update`);
  for (const role of rolesToFix) {
    console.log(`  ✓ Role ${role.code}: ${role.empType} → ${FREELANCE_EMP_TYPE}`);
    role.empType = FREELANCE_EMP_TYPE;
    await role.save();
  }

// --- Candidates ---
  // Querying by regex so we catch rows regardless of what employmentType says.
  const candidates = await Candidate.find({ roleCode: { $regex: '^F', $options: 'i' } });
  const candidatesToFix = candidates.filter((c) => c.employmentType !== FREELANCE_EMP_TYPE);
  console.log(`\n👥 Candidates with an F role code: ${candidates.length}, already correct: ${candidates.length - candidatesToFix.length}, to update: ${candidatesToFix.length}`);
  for (const candidate of candidatesToFix) {
    console.log(`  ✓ ${candidate.fullName} (${candidate.email}) · ${candidate.roleCode}: ${candidate.employmentType} → ${FREELANCE_EMP_TYPE}`);
    candidate.employmentType = FREELANCE_EMP_TYPE;
    await candidate.save();
  }

  // --- Clear invalid empty strings on the FREELANCE CODING columns ---
  // These fields are enum-restricted and optional. Rows written before the
  // schema stopped defaulting them to '' hold '' in the DB, which fails enum
  // validation on every save — so no freelance column could be edited.
  // Empty string means "unset", so it becomes null.
  const EMPTY_STRING_FIELDS = [
    'screeningInterview', 'calendlyLinkSent', 'calendlyLinkStatus', 'ndaIca',
    'slackStatus', 'bootcampAttempts', 'bootcampStatus', 'onboarding',
    'project', 'projectStatus'
  ];
  const badRows = await Candidate.find({
    $or: EMPTY_STRING_FIELDS.map((field) => ({ [field]: '' }))
  });
  console.log(`\n🧹 Candidates holding an empty string in a FREELANCE CODING column: ${badRows.length}`);
  for (const candidate of badRows) {
    EMPTY_STRING_FIELDS.forEach((field) => {
      if (candidate[field] === '') candidate[field] = null;
    });
    await candidate.save();
  }
  if (badRows.length > 0) {
    console.log(`  ✓ Cleared empty strings → null so these columns are editable again.`);
  }

  // --- Report any non-F candidates wrongly marked FREELANCE CODING ---
  const nonFreelance = await Candidate.find({ employmentType: FREELANCE_EMP_TYPE, roleCode: { $not: /^F/i } });
  if (nonFreelance.length > 0) {
    console.log(`\n⚠️  ${nonFreelance.length} candidate(s) marked FREELANCE CODING but whose role code does not start with F:`);
    nonFreelance.slice(0, 20).forEach((c) => console.log(`     - ${c.fullName} (${c.roleCode})`));
    console.log('   These are left as-is — they may be intentional manual entries.');
  }

  console.log(`\n✅ Migration complete!`);
  console.log(`   Roles updated: ${rolesToFix.length}`);
  console.log(`   Candidates updated: ${candidatesToFix.length}`);
  console.log(`   Database: ${dbName}\n`);

  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
