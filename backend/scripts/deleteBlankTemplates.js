require('dotenv').config({ path: '/Users/vikas/Documents/biztech-ats/backend/.env' });
const mongoose = require('mongoose');
const EmailTemplate = require('/Users/vikas/Documents/biztech-ats/backend/models/emailTemplate');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  
  // Delete templates with empty/blank name, subject, or body
  const result = await EmailTemplate.deleteMany({
    $or: [
      { name: { $in: [null, '', ''] } },
      { subject: { $in: [null, '', ''] } },
      { body: { $in: [null, '', ''] } },
      { name: /^\s*$/ },
      { subject: /^\s*$/ },
      { body: /^\s*$/ }
    ]
  });
  
  console.log('Deleted blank templates:', result.deletedCount);
  
  const remaining = await EmailTemplate.countDocuments();
  console.log('Remaining templates:', remaining);
  
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
