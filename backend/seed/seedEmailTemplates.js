// One-off script to seed default email templates if none exist.
//
// Usage:
//   node seed/seedEmailTemplates.js
//   node seed/seedEmailTemplates.js --reset   (deletes all existing templates first)

require('dotenv').config();
const mongoose = require('mongoose');
const EmailTemplate = require('../models/emailTemplate');

const DEFAULTS = [
  {
    name: 'Interview Invitation',
    subject: 'Interview Invitation – {{roleTitle}} at BizTech Analytics',
    body: `Hi {{candidateName}},

Thank you for applying to the {{roleTitle}} ({{roleCode}}) position at BizTech Analytics.

We'd like to invite you for an interview. Our recruiter will reach out shortly to confirm a slot.

Best regards,
BizTech Analytics Talent Team`,
    attachments: []
  },
  {
    name: 'Application Received',
    subject: 'We received your application – {{roleTitle}}',
    body: `Hi {{candidateName}},

This confirms we've received your application for {{roleTitle}} ({{roleCode}}). Our team is reviewing it and will follow up within 5 business days.

Best regards,
BizTech Analytics Talent Team`,
    attachments: []
  },
  {
    name: 'Rejection – Not Progressing',
    subject: 'Update on your application – {{roleTitle}}',
    body: `Hi {{candidateName}},

Thank you for your interest in {{roleTitle}}. After careful review, we've decided to move forward with other candidates at this time.

We'll keep your profile on file for future openings.

Best regards,
BizTech Analytics Talent Team`,
    attachments: []
  },
  {
    name: 'Assessment Form Request',
    subject: 'Next step: quick form for {{roleTitle}}',
    body: `Hi {{candidateName}},

As the next step for {{roleTitle}} ({{roleCode}}), please fill out this short form so we can move your application forward:

{{formLink}}

Best regards,
BizTech Analytics Talent Team`,
    attachments: []
  }
];

async function run() {
  const args = process.argv.slice(2);
  const reset = args.includes('--reset');

  console.log(`Connecting to: ${process.env.MONGO_URI}`);
  await mongoose.connect(process.env.MONGO_URI);

  if (reset) {
    await EmailTemplate.deleteMany({});
    console.log('Cleared all existing email templates.');
  }

  const existing = await EmailTemplate.countDocuments();
  if (existing > 0 && !reset) {
    console.log(`${existing} template(s) already exist. Re-run with --reset to replace them.`);
    await mongoose.disconnect();
    return;
  }

  for (const t of DEFAULTS) {
    await EmailTemplate.create(t);
  }

  console.log(`✅ Seeded ${DEFAULTS.length} default email templates.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
