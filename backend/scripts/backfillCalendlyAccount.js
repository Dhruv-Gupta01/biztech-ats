// One-off: fill Candidate.calendlyAccount for people who booked before the Calendly sync started recording the
// account, using the hiring tracker CSV (the sheet with the "account" column: "Hiring Team" / "Kartik Mishra").
//
// The tracker lists interview slots top to bottom in date order, so when someone has several slots the LAST one
// decides. Only candidates whose calendlyAccount is blank are touched; an existing value is never overwritten.
//
// Dry run by default: prints what it would do and writes nothing. Add --apply to write.
// Usage: node scripts/backfillCalendlyAccount.js "<tracker.csv>" [--apply]
const fs = require('fs');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { parse } = require('csv-parse/sync');

dotenv.config();

const Candidate = require('../models/Candidate');

const ACCOUNTS = { 'hiring team': 'Hiring Team', 'kartik mishra': 'Kartik Mishra', 'harnoor mann': 'Harnoor Mann' };
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

// Returns Map(email -> account) from the tracker. A row can hold two tables side by side, so every cell with an
// email is paired with the first account name in the next three cells.
function accountsFromTracker(csvText) {
  const rows = parse(csvText, { relax_column_count: true, skip_empty_lines: false, bom: true });
  const out = new Map();
  for (const row of rows) {
    row.forEach((cell, i) => {
      if (!String(cell).includes('@')) return;
      const emails = (String(cell).match(EMAIL) || []).map((e) => e.toLowerCase());
      let account = '';
      for (let j = i + 1; j < Math.min(i + 4, row.length); j += 1) {
        const hit = ACCOUNTS[String(row[j]).trim().toLowerCase()];
        if (hit) { account = hit; break; }
      }
      if (account) emails.forEach((e) => out.set(e, account)); // later rows overwrite earlier ones
    });
  }
  return out;
}

async function main() {
  const file = process.argv[2];
  const apply = process.argv.includes('--apply');
  if (!file || !fs.existsSync(file)) {
    console.error('Usage: node scripts/backfillCalendlyAccount.js "<tracker.csv>" [--apply]');
    process.exit(1);
  }
  if (!process.env.MONGO_URI) { console.error('MONGO_URI is not set.'); process.exit(1); }

  const tracker = accountsFromTracker(fs.readFileSync(file, 'utf8'));
  await mongoose.connect(process.env.MONGO_URI);
  const found = await Candidate.find({ email: { $in: [...tracker.keys()] } }, 'email calendlyAccount calendlyLinkStatus').lean();

  const toSet = []; const already = []; const conflicts = [];
  for (const c of found) {
    const want = tracker.get(c.email);
    if (!c.calendlyAccount) toSet.push({ id: c._id, account: want });
    else if (c.calendlyAccount === want) already.push(c);
    else conflicts.push(c);
  }
  const by = (list) => list.reduce((m, x) => ({ ...m, [x.account]: (m[x.account] || 0) + 1 }), {});
  console.log(`tracker emails: ${tracker.size} | found in the ATS: ${found.length} | not in the ATS: ${tracker.size - found.length}`);
  console.log(`would set: ${toSet.length} ${JSON.stringify(by(toSet))} | already correct: ${already.length} | already a different account (left alone): ${conflicts.length}`);

  if (!apply) {
    console.log('Dry run, nothing written. Re-run with --apply to write.');
  } else if (toSet.length) {
    const r = await Candidate.bulkWrite(toSet.map((x) => ({ updateOne: { filter: { _id: x.id, calendlyAccount: { $in: [null, ''] } }, update: { $set: { calendlyAccount: x.account } } } })));
    console.log(`Written: ${r.modifiedCount} candidates updated.`);
  }
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}

module.exports = { accountsFromTracker };
