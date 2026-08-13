// One-off script to create (or reset) a recruiter account, since recruiters
// cannot self-signup (only candidates can, via POST /api/auth/signup).
//
// Usage:
//   node seed/seedRecruiter.js
//   node seed/seedRecruiter.js "Recruiter Name" recruiter@biztech.com SomePassword123
//   node seed/seedRecruiter.js "Recruiter Name" recruiter@biztech.com SomePassword123 --reset
//
// --reset deletes any existing user with that email first, then recreates it —
// use this if you're unsure what password an existing account actually has.

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const DEFAULT_NAME = 'BizTech Recruiter';
const DEFAULT_EMAIL = 'recruiter@biztech.com';
const DEFAULT_PASSWORD = 'Recruiter@123';

async function run() {
  const args = process.argv.slice(2);
  const reset = args.includes('--reset');
  const positional = args.filter((a) => a !== '--reset');
  const [argName, argEmail, argPassword] = positional;

  const fullName = argName || DEFAULT_NAME;
  const email = (argEmail || DEFAULT_EMAIL).toLowerCase().trim();
  const password = argPassword || DEFAULT_PASSWORD;

  console.log(`Connecting to: ${process.env.MONGO_URI}`);
  await mongoose.connect(process.env.MONGO_URI);

  const existing = await User.findOne({ email });

  if (existing && !reset) {
    console.log(`A user with email "${email}" already exists (role: ${existing.role}).`);
    console.log('If you\'re unsure of its password, re-run this script with --reset to recreate it:');
    console.log(`   node seed/seedRecruiter.js "${fullName}" ${email} ${password} --reset`);
    await mongoose.disconnect();
    return;
  }

  if (existing && reset) {
    await User.deleteOne({ email });
    console.log(`Deleted existing account for ${email}.`);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await User.create({ fullName, email, passwordHash, role: 'recruiter' });

  console.log('✅ Recruiter account ready:');
  console.log(`   Email:    ${email}`);
  console.log(`   Password: ${password}`);
  console.log('   Use these to log in via the Recruiter Login tab.');

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});