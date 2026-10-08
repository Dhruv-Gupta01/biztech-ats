const mongoose = require('mongoose');
const Candidate = require('../models/Candidate');
const dotenv = require('dotenv');

dotenv.config();

async function migrate() {
  await mongoose.connect(process.env.MONGO_URI);
  
  // Fix status values
  const statusResult = await Candidate.updateMany(
    { status: 'Naukri Response' },
    { $set: { status: 'Information Form Response' } }
  );
  console.log('Status migration:', statusResult.modifiedCount, 'candidates updated');

  // Fix cvScreening values
  const cvResult = await Candidate.updateMany(
    { $or: [{ cvScreening: { $exists: false } }, { cvScreening: null }, { cvScreening: '' }] },
    { $set: { cvScreening: 'Not Set' } }
  );
  console.log('CV Screening migration:', cvResult.modifiedCount, 'candidates updated');

  // Fix assessmentStatus values
  const assessmentResult = await Candidate.updateMany(
    { assessmentStatus: 'Not interested' },
    { $set: { assessmentStatus: 'Not Set' } }
  );
  console.log('Assessment Status migration:', assessmentResult.modifiedCount, 'candidates updated');

  await mongoose.disconnect();
  console.log('Migration complete');
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
