require('dotenv').config({ path: './.env' });
const mongoose = require('mongoose');
const EmailTemplate = require('../models/emailTemplate');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const templates = await EmailTemplate.find({}, '_id name subject body createdAt');
  templates.forEach((t, i) => {
    console.log(`${i + 1}. id=${t._id} name="${t.name}" subject="${t.subject?.slice(0, 60)}" bodyLen=${t.body?.length || 0} created=${t.createdAt}`);
  });
  await mongoose.disconnect();
}
run().catch((err) => { console.error(err); process.exit(1); });