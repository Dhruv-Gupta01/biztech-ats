// Daily Naukri CSV ETL pipeline (SRD: automate the manual daily Naukri
// export upload). Flow: pull the newest CSV out of a shared Drive folder,
// parse it, validate each row, insert the clean ones straight into the
// candidate pool, and park anything broken or ambiguous in ImportReview
// instead of silently dropping it — a recruiter fixes/approves or dismisses
// those from the Import Review tab. Reuses the same CSV shape as the manual
// bulk importer (bulkController.js) and the same required-field rules.
//
// Like the other integrations in this codebase, this no-ops with a clear
// reason until it's actually configured (ETL_ENABLED=true + Drive creds).

const { parse } = require('csv-parse/sync');
const Candidate = require('../models/Candidate');
const Role = require('../models/Role');
const ImportReview = require('../models/ImportReview');
const EtlRun = require('../models/EtlRun');
const drive = require('./googleDriveService');

const VALID_EMP_TYPES = ['Full-Time', 'Part-Time', 'Contract', 'Internship'];
const VALID_STATUSES = ['Applied', 'Screened', 'Shortlisted', 'Interviewing', 'Rejected', 'Hired'];
const EMAIL_RE = /^[\w.+-]+@[\w-]+\.[\w.-]+$/;

// Naukri's own recruiter-export CSVs (downloaded straight from Naukri, one
// per job posting) use their own column names and free-text formats, not our
// internal shape. Detected by the presence of Naukri's "Email ID"/"Name"
// headers (our internal shape uses "email"/"fullName" instead), and mapped
// onto the same shape validateRow() expects everywhere else. A CSV already
// in our internal shape (e.g. hand-built, or exported by the manual Bulk
// Import screen) passes through untouched.
function parseNaukriExperience(text) {
  if (!text) return null;
  const str = String(text);
  if (/fresher/i.test(str)) return 0; // Naukri's standard label for entry-level / no experience
  const yearsMatch = str.match(/(\d+(?:\.\d+)?)\s*Year/i);
  const monthsMatch = str.match(/(\d+(?:\.\d+)?)\s*Month/i);
  if (!yearsMatch && !monthsMatch) {
    const plain = Number(str);
    return Number.isNaN(plain) ? null : plain;
  }
  const years = yearsMatch ? Number(yearsMatch[1]) : 0;
  const months = monthsMatch ? Number(monthsMatch[1]) : 0;
  return Math.round((years + months / 12) * 10) / 10;
}

function parseNaukriSalary(text) {
  if (!text) return 0;
  const str = String(text).trim();
  if (!str || /not disclosed/i.test(str)) return 0;
  const numMatch = str.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  if (!numMatch) return 0;
  let value = Number(numMatch[1]);
  if (/crore/i.test(str)) value *= 10000000;
  else if (/lakh/i.test(str)) value *= 100000;
  else if (/thousand/i.test(str)) value *= 1000;
  return Math.round(value);
}

// Naukri sometimes exports "Email ID" as two comma-separated addresses (most
// often the same address typed twice) — take the first non-empty one rather
// than flagging every one of these for review.
function parseNaukriEmail(text) {
  if (!text) return '';
  return String(text).split(',')[0].trim();
}

// `roleTitleToCode` maps lowercased Role.title -> Role.code, so a Naukri
// "Job Title" that happens to exactly match one of our role titles gets
// auto-assigned; anything else is left blank for a recruiter to pick by hand
// in the Import Review tab (there's no reliable way to guess a role from
// free-text job-posting titles otherwise).
function mapNaukriExportRow(row, roleTitleToCode) {
  const isRawNaukriExport = Object.prototype.hasOwnProperty.call(row, 'Email ID') || Object.prototype.hasOwnProperty.call(row, 'Name');
  if (!isRawNaukriExport) return row;

  const jobTitle = (row['Job Title'] || '').trim();

  return {
    fullName: row['Name'] || '',
    email: parseNaukriEmail(row['Email ID']),
    phone: row['Phone Number'] || '',
    location: row['Current Location'] || '',
    roleCode: roleTitleToCode.get(jobTitle.toLowerCase()) || '',
    yearsOfExperience: parseNaukriExperience(row['Total Experience']),
    ctcCurrent: parseNaukriSalary(row['Annual Salary']),
    noticePeriod: row['Notice period/ Availability to join'] || '',
    skills: '',
    source: 'Naukri Import',
    _jobTitle: jobTitle
  };
}

// Checks one (already-mapped) row against the same required fields as the
// manual bulk importer, plus two Naukri-export-specific checks: a
// well-formed email, and a roleCode that actually matches a Role we know
// about. Returns either a ready-to-insert candidate payload, or a list of
// human-readable reasons it needs a human to look at it.
function validateRow(row, knownRoleCodes) {
  const reasons = [];

  const fullName = (row.fullName || '').trim();
  const email = (row.email || '').trim().toLowerCase();
  const phone = (row.phone || '').trim();
  const roleCode = (row.roleCode || '').trim().toUpperCase();
  const yearsOfExperience = row.yearsOfExperience;

  if (!fullName) reasons.push('Missing fullName');
  if (!email) reasons.push('Missing email');
  else if (!EMAIL_RE.test(email)) reasons.push(`Malformed email "${email}"`);
  if (!phone) reasons.push('Missing phone');
  if (!roleCode) {
    reasons.push(row._jobTitle ? `No roleCode — Naukri job title was "${row._jobTitle}"; pick a role manually` : 'Missing roleCode');
  } else if (!knownRoleCodes.has(roleCode)) {
    reasons.push(`Unknown roleCode "${roleCode}" — no matching Role exists yet`);
  }
  if (yearsOfExperience === undefined || yearsOfExperience === null || yearsOfExperience === '' || Number.isNaN(Number(yearsOfExperience))) {
    reasons.push('Missing or non-numeric yearsOfExperience');
  }

  if (reasons.length > 0) return { ok: false, reasons };

  const employmentType = VALID_EMP_TYPES.includes(row.employmentType) ? row.employmentType : 'Full-Time';
  const status = VALID_STATUSES.includes(row.status) ? row.status : 'Applied';
  const skills = row.skills ? row.skills.split(';').map((s) => s.trim()).filter(Boolean) : [];

  return {
    ok: true,
    candidate: {
      fullName,
      email,
      phone,
      location: row.location || '',
      roleCode,
      employmentType,
      yearsOfExperience: Number(yearsOfExperience) || 0,
      ctcCurrent: Number(row.ctcCurrent) || 0,
      ctcExpected: Number(row.ctcExpected) || 0,
      noticePeriod: row.noticePeriod || '',
      skills,
      resumeUrl: '',
      status,
      source: row.source || 'Naukri Import'
    }
  };
}

async function markRunFinished(run, fields) {
  run.finishedAt = new Date();
  Object.assign(run, fields);
  await run.save();
  return run;
}

// Runs one full pipeline pass: fetch newest CSV -> parse -> validate each row
// -> insert clean rows -> flag the rest into ImportReview -> move the source
// file into Drive's processed/ folder -> record an EtlRun summary. Safe to
// call from the 9am cron or from the manual "Run Import Now" button — same
// function either way, only `triggeredBy` differs.
async function runNaukriEtl({ triggeredBy = 'cron' } = {}) {
  if (process.env.ETL_ENABLED !== 'true') {
    return {
      ran: false,
      reason: 'Naukri ETL disabled. Set ETL_ENABLED=true in .env once Google Drive is configured.'
    };
  }
  if (!drive.isConfigured()) {
    return { ran: false, reason: drive.configurationReason() };
  }

  const run = await EtlRun.create({ status: 'running', triggeredBy });

  try {
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    const file = await drive.findNewestCsv(folderId);

    if (!file) {
      await markRunFinished(run, { status: 'skipped', message: 'No CSV file found in the Drive folder.' });
      return { ran: true, status: 'skipped', message: 'No CSV file found in the Drive folder.' };
    }

    const csvText = await drive.downloadFileText(file.id);
    let records;
    try {
      records = parse(csvText, { columns: true, skip_empty_lines: true, trim: true });
    } catch (parseErr) {
      await markRunFinished(run, {
        status: 'failed',
        sourceFileName: file.name,
        sourceFileId: file.id,
        message: `Could not parse "${file.name}": ${parseErr.message}`
      });
      return { ran: true, status: 'failed', message: `Could not parse "${file.name}": ${parseErr.message}` };
    }

    const roles = await Role.find({}, 'code title');
    const knownRoleCodes = new Set(roles.map((r) => r.code));
    const roleTitleToCode = new Map(roles.map((r) => [r.title.toLowerCase(), r.code]));

    let insertedCount = 0;
    let flaggedCount = 0;
    let duplicateCount = 0;

    for (let i = 0; i < records.length; i++) {
      const rowNum = i + 2; // header row + 1-indexing, matches the row number in a spreadsheet
      const row = mapNaukriExportRow(records[i], roleTitleToCode);

      const result = validateRow(row, knownRoleCodes);
      if (!result.ok) {
        await ImportReview.create({ sourceFile: file.name, sourceRow: rowNum, rawData: row, reasons: result.reasons });
        flaggedCount++;
        continue;
      }

      const existing = await Candidate.findOne({ email: result.candidate.email });
      if (existing) {
        await ImportReview.create({
          sourceFile: file.name,
          sourceRow: rowNum,
          rawData: row,
          reasons: [`Duplicate email — already in the pool as "${existing.fullName}" (Status: ${existing.status})`]
        });
        duplicateCount++;
        continue;
      }

      await Candidate.create(result.candidate);
      insertedCount++;
    }

    await drive.moveFileToProcessed(file.id, file.name, folderId);

    const message = `Imported ${insertedCount} candidate(s) from "${file.name}". ${flaggedCount} flagged for review, ${duplicateCount} duplicate(s) flagged.`;
    await markRunFinished(run, {
      status: 'success',
      sourceFileName: file.name,
      sourceFileId: file.id,
      totalRows: records.length,
      insertedCount,
      flaggedCount,
      duplicateCount,
      message
    });

    return { ran: true, status: 'success', message, totalRows: records.length, insertedCount, flaggedCount, duplicateCount };
  } catch (err) {
    console.error('[NaukriEtl] Run failed:', err);
    await markRunFinished(run, { status: 'failed', message: err.message });
    return { ran: true, status: 'failed', message: err.message };
  }
}

module.exports = { runNaukriEtl, validateRow, mapNaukriExportRow, parseNaukriExperience, parseNaukriSalary, parseNaukriEmail };
