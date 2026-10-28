// One-off import of the bootcamp batch sheet (Batch / Name / Email / Phone / Joined).
//
// Input is a pipe-delimited text file kept OUTSIDE the repo (it holds candidate PII):
//   @B_4_17/08                      a line starting with @ sets the batch for the rows below it
//   Name|email|phone|Joined|note    one row per person; Joined / Not joined / blank, note optional
//
// For every person it writes candidate.bootcampBatches = [{ batch, joined, note }]:
//   - candidates already in the ATS (matched by email) only get bootcampBatches set — nothing else changes
//   - candidates not in the ATS are created (role CODING, Freelance, source "Bootcamp")
//   - a row with no email is matched to the email the same name has elsewhere in the sheet;
//     if that is missing or ambiguous the row is skipped and listed in the report
//   - the same person repeated inside one batch becomes one entry, the later non-blank Joined wins
// Re-running is safe: bootcampBatches is rebuilt from the file each time.
//
// DRY RUN by default (reads the DB, writes nothing). Pass --commit to write.
//
// Usage:
//   node scripts/importBootcampBatches.js /path/outside/repo/bootcamp_batches.txt
//   node scripts/importBootcampBatches.js /path/outside/repo/bootcamp_batches.txt --commit
const fs = require('fs');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const Candidate = require('../models/Candidate');

const EMAIL_RE = /[^\s/,;|]+@[^\s/,;|]+\.[^\s/,;|]+/g;
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const batchNum = (b) => parseInt(String(b).replace(/^B_/, ''), 10) || 0;

// Sheet phones come as "91 98074 05372", "-9304240675", "(+91) 8238714829" or, when Excel
// mangled them, "9.19738E+11" — that last form has lost its digits, so it is treated as missing.
function cleanPhone(raw) {
  const s = String(raw || '').trim();
  if (!s || /e\+/i.test(s)) return null;
  let digits = s.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  return digits.length >= 7 ? digits : null;
}

function parse(text) {
  const rows = [];
  let batch = null;
  text.split(/\r?\n/).forEach((line) => {
    if (!line.trim()) return;
    if (line.startsWith('@')) { batch = line.slice(1).trim(); return; }
    const [name, emailCell, phone, joined, note] = line.split('|').map((x) => (x || '').trim());
    const joinedNorm = /^joined$/i.test(joined) ? 'Joined' : /^not joined$/i.test(joined) ? 'Not joined' : null;
    rows.push({
      batch,
      name: name.replace(/\s+/g, ' '),
      emails: ((emailCell || '').match(EMAIL_RE) || []).map((e) => e.toLowerCase()),
      phone: cleanPhone(phone),
      phoneLost: /e\+/i.test(phone || ''),
      joined: joinedNorm,
      note: note || ''
    });
  });
  return rows;
}

async function run() {
  const args = process.argv.slice(2);
  const commit = args.includes('--commit');
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('Usage: node scripts/importBootcampBatches.js <batches.txt> [--commit]');
    process.exit(1);
  }
  if (!process.env.MONGO_URI) {
    console.error('❌ MONGO_URI is not defined');
    process.exit(1);
  }

  const rows = parse(fs.readFileSync(file, 'utf-8'));
  console.log(`Read ${rows.length} rows`);

  // name -> emails seen for that name, to fill rows that came without an email
  const emailsByName = {};
  rows.filter((r) => r.emails.length).forEach((r) => {
    (emailsByName[norm(r.name)] = emailsByName[norm(r.name)] || new Set()).add(r.emails[0]);
  });

  const people = new Map(); // primary email -> person
  const skipped = [];
  rows.forEach((r) => {
    let emails = r.emails;
    if (!emails.length) {
      const known = emailsByName[norm(r.name)];
      if (known && known.size === 1) emails = [[...known][0]];
    }
    if (!emails.length) { skipped.push(`${r.name} (${r.batch})`); return; }
    const key = emails[0];
    if (!people.has(key)) people.set(key, { email: key, altEmails: [], name: r.name, phone: null, batches: new Map() });
    const p = people.get(key);
    emails.slice(1).forEach((e) => { if (!p.altEmails.includes(e)) p.altEmails.push(e); });
    if (!p.phone && r.phone) p.phone = r.phone;
    const prev = p.batches.get(r.batch) || { joined: null, note: '' };
    p.batches.set(r.batch, { joined: r.joined || prev.joined, note: r.note || prev.note });
  });

  const asEntries = (p) => [...p.batches.entries()]
    .map(([batch, v]) => ({ batch, joined: v.joined, note: v.note }))
    .sort((a, b) => batchNum(a.batch) - batchNum(b.batch));

  await mongoose.connect(process.env.MONGO_URI);
  console.log(`✅ Connected to database: ${mongoose.connection.db.databaseName}`);

  const list = [...people.values()];
  const lookup = [...new Set(list.flatMap((p) => [p.email, ...p.altEmails]))];
  const found = new Map((await Candidate.find({ email: { $in: lookup } }, { email: 1, phone: 1 }).lean()).map((c) => [c.email, c]));

  const updates = [];
  const creates = [];
  list.forEach((p) => {
    const match = [p.email, ...p.altEmails].find((e) => found.has(e));
    if (match) {
      const u = { email: match, bootcampBatches: asEntries(p) };
      // Only fill a phone that is missing / N/A — never overwrite a real number.
      if (p.phone && ['', 'N/A', 'NA'].includes(String(found.get(match).phone || '').trim().toUpperCase())) u.phone = p.phone;
      updates.push(u);
    } else creates.push({
      fullName: p.name,
      email: p.email,
      phone: p.phone || 'N/A',
      location: '',
      roleCode: 'CODING',
      employmentType: 'Freelance',
      yearsOfExperience: 0,
      source: 'Bootcamp',
      generalRemarks: 'Added from the bootcamp batch sheet.',
      bootcampBatches: asEntries(p)
    });
  });

  const invalid = creates.filter((d) => new Candidate(d).validateSync());
  const perBatch = {};
  list.forEach((p) => p.batches.forEach((v, b) => {
    perBatch[b] = perBatch[b] || { listed: 0, Joined: 0, 'Not joined': 0, blank: 0 };
    perBatch[b].listed += 1;
    perBatch[b][v.joined || 'blank'] += 1;
  }));

  console.log(`\nPeople: ${list.length} unique  |  already in ATS: ${updates.length}  |  to create: ${creates.length}  |  invalid: ${invalid.length}`);
  console.log(`Existing candidates whose N/A phone would be filled: ${updates.filter((u) => u.phone).length}`);
  console.log(`Rows skipped (no email, name not resolvable): ${skipped.length}`);
  skipped.forEach((s) => console.log(`  - ${s}`));
  console.log(`Phones lost to Excel formatting (stored as N/A for new candidates): ${rows.filter((r) => r.phoneLost).length} rows`);
  console.log('\nPer batch:');
  Object.keys(perBatch).sort((a, b) => batchNum(a) - batchNum(b)).forEach((b) => console.log(`  ${b}`.padEnd(14), JSON.stringify(perBatch[b])));

  if (!commit) {
    console.log('\nDRY RUN — nothing written. Re-run with --commit to import.');
    await mongoose.disconnect();
    return;
  }

  if (updates.length) {
    const res = await Candidate.bulkWrite(updates.map((u) => ({
      updateOne: { filter: { email: u.email }, update: { $set: u.phone ? { bootcampBatches: u.bootcampBatches, phone: u.phone } : { bootcampBatches: u.bootcampBatches } } }
    })));
    console.log(`\nTagged existing candidates: ${res.modifiedCount} modified (${updates.length} matched), phones filled: ${updates.filter((u) => u.phone).length}`);
  }
  const valid = creates.filter((d) => !invalid.includes(d));
  if (valid.length) {
    const res = await Candidate.insertMany(valid, { ordered: false });
    console.log(`Created new candidates: ${res.length}`);
  }
  await mongoose.disconnect();
}

run().catch((err) => { console.error(err); process.exit(1); });
