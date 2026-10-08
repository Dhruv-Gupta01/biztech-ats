const mongoose = require('mongoose');
const Candidate = require('../models/Candidate');
const dotenv = require('dotenv');

dotenv.config();

async function migrate() {
  await mongoose.connect(process.env.MONGO_URI);
  const result = await Candidate.updateMany(
    { status: 'Naukri Response' },
    { $set: { status: 'Information Form Response' } }
  );
  console.log('Migration complete:', result.modifiedCount, 'candidates updated');
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
