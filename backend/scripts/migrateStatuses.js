const mongoose = require('mongoose');
const Candidate = require('../models/Candidate');
const dotenv = require('dotenv');

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

const STATUS_MAPPING = {
  'Applied': 'Naukri Response',
  'Screened': 'Naukri Response',
  'Shortlisted': 'Information Form',
  'Interviewing': 'Interview 1',
  'Hired': 'Selected',
  'Rejected': 'Rejected'
};

async function migrate() {
  if (!MONGO_URI) {
    console.error('❌ MONGO_URI is not defined in .env');
    process.exit(1);
  }

  console.log('🔗 Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  const dbName = mongoose.connection.db.databaseName;
  console.log(`✅ Connected to database: ${dbName}`);

  const oldStatuses = Object.keys(STATUS_MAPPING);
  const candidates = await Candidate.find({ status: { $in: oldStatuses } });

  if (candidates.length === 0) {
    console.log('✅ No candidates with old statuses found. Database is already up to date.');
    await mongoose.disconnect();
    return;
  }

  console.log(`📊 Found ${candidates.length} candidate(s) with old statuses. Updating...`);

  let updatedCount = 0;
  for (const candidate of candidates) {
    const newStatus = STATUS_MAPPING[candidate.status];
    if (newStatus) {
      candidate.status = newStatus;
      await candidate.save();
      updatedCount++;
      console.log(`  ✓ ${candidate.fullName} (${candidate.email}): ${candidate.status} → ${newStatus}`);
    }
  }

  console.log(`\n✅ Migration complete!`);
  console.log(`   Updated: ${updatedCount} candidate(s)`);
  console.log(`   Database: ${dbName}\n`);

  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
