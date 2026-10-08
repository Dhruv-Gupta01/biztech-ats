const mongoose = require('mongoose');
const Candidate = require('../models/Candidate');
const dotenv = require('dotenv');

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

async function migrate() {
  if (!MONGO_URI) {
    console.error('❌ MONGO_URI is not defined in .env');
    process.exit(1);
  }

  console.log('🔗 Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  const dbName = mongoose.connection.db.databaseName;
  console.log(`✅ Connected to database: ${dbName}`);

  // Set Assessment Status to 'Not Set' for candidates who don't have a meaningful value
  const result = await Candidate.updateMany(
    {
      $or: [
        { assessmentStatus: { $exists: false } },
        { assessmentStatus: null },
        { assessmentStatus: '' },
        { assessmentStatus: 'Not interested' }
      ]
    },
    { $set: { assessmentStatus: 'Not Set' } }
  );

  console.log(`📊 Migration complete!`);
  console.log(`   Updated: ${result.modifiedCount} candidate(s)`);
  console.log(`   Database: ${dbName}\n`);

  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
