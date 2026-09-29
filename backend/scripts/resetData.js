const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

async function resetData() {
  if (!MONGO_URI) {
    console.error('❌ MONGO_URI is not defined in .env');
    process.exit(1);
  }

  console.log('🔗 Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  const dbName = mongoose.connection.db.databaseName;
  console.log(`✅ Connected to database: ${dbName}`);

  const collections = [
    'candidates',
    'roles',
    'importreviews',
    'formsyncruns',
    'googleforms',
    'slackmappings',
    'etlruns'
  ];

  console.log('\n🗑️  Deleting data from collections:');
  collections.forEach((name) => console.log(`   - ${name}`));

  for (const name of collections) {
    try {
      const result = await mongoose.connection.db.collection(name).deleteMany({});
      console.log(`   ✅ ${name}: ${result.deletedCount} document(s) deleted`);
    } catch (err) {
      console.error(`   ❌ ${name}: ${err.message}`);
    }
  }

  console.log('\n🎉 Data reset complete!');
  console.log('   Preserved: email templates, users, and all system functionality\n');

  await mongoose.disconnect();
}

resetData().catch((err) => {
  console.error('❌ Reset failed:', err);
  process.exit(1);
});
