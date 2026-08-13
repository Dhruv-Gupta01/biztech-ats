// Google Form response sync: outreach emails go out with a Google Form link
// that has the candidate's email pre-filled (see outreachController.js's
// buildFormLink). When the candidate submits, Google Forms writes the row to
// a linked response Sheet. This service reads that Sheet (via Drive export,
// reusing the same service account as the Naukri ETL — see
// googleDriveService.js) and matches each response back to a Candidate by
// email, attaching the full row onto candidate.formSubmission.
//
// Manually triggered only ("Sync Form Responses" button) — no cron. Like the
// other integrations here, no-ops with a clear reason until configured.

const { parse } = require('csv-parse/sync');
const Candidate = require('../models/Candidate');
const FormSyncRun = require('../models/FormSyncRun');
const drive = require('./googleDriveService');

const DEFAULT_EMAIL_COLUMN = 'Email Address'; // Forms' own column name when "Collect email addresses" is on

// Google Sheets exports Forms' "Timestamp" column as "DD/MM/YYYY HH:mm:ss"
// (day-first) — JS's `new Date(string)` assumes month-first and silently
// produces "Invalid Date" for any day above 12, which then fails Mongoose's
// Date cast on save. Parsed by hand instead of trusting the built-in parser.
// Falls back to "now" if the format doesn't match (still better than crashing
// the whole sync over one unparseable timestamp).
function parseSheetTimestamp(text) {
  const match = String(text || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!match) return new Date();
  const [, day, month, year, hour, minute, second] = match.map(Number);
  const date = new Date(year, month - 1, day, hour, minute, second);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function isConfigured() {
  return drive.hasCredentials() && !!process.env.GOOGLE_FORM_RESPONSE_SHEET_ID;
}

function configurationReason() {
  const missing = [];
  if (!drive.hasCredentials()) missing.push('GOOGLE_SERVICE_ACCOUNT_KEY_FILE or GOOGLE_SERVICE_ACCOUNT_KEY');
  if (!process.env.GOOGLE_FORM_RESPONSE_SHEET_ID) missing.push('GOOGLE_FORM_RESPONSE_SHEET_ID');
  return `Missing ${missing.join(' and ')} in .env.`;
}

async function markRunFinished(run, fields) {
  run.finishedAt = new Date();
  Object.assign(run, fields);
  await run.save();
  return run;
}

// Runs one sync pass: download the response Sheet -> parse -> for each row,
// find the Candidate whose email matches the configured email column ->
// attach the whole row as formSubmission. Rows that don't match any known
// candidate are counted but otherwise skipped (this never creates
// candidates, only enriches existing ones).
async function syncFormResponses() {
  if (process.env.FORM_SYNC_ENABLED !== 'true') {
    return { ran: false, reason: 'Form response sync disabled. Set FORM_SYNC_ENABLED=true in .env once the Google Form is configured.' };
  }
  if (!isConfigured()) {
    return { ran: false, reason: configurationReason() };
  }

  const run = await FormSyncRun.create({ status: 'running' });
  const emailColumn = process.env.GOOGLE_FORM_EMAIL_COLUMN || DEFAULT_EMAIL_COLUMN;

  try {
    const sheetId = process.env.GOOGLE_FORM_RESPONSE_SHEET_ID;
    const csvText = await drive.downloadSheetAsCsvText(sheetId);

    let records;
    try {
      records = parse(csvText, { columns: true, skip_empty_lines: true, trim: true });
    } catch (parseErr) {
      await markRunFinished(run, { status: 'failed', message: `Could not parse response Sheet: ${parseErr.message}` });
      return { ran: true, status: 'failed', message: `Could not parse response Sheet: ${parseErr.message}` };
    }

    let matchedCount = 0;
    let unmatchedCount = 0;

    for (const row of records) {
      const email = (row[emailColumn] || '').trim().toLowerCase();
      if (!email) { unmatchedCount++; continue; }

      const candidate = await Candidate.findOne({ email });
      if (!candidate) { unmatchedCount++; continue; }

      candidate.formSubmission = {
        submittedAt: parseSheetTimestamp(row['Timestamp']),
        matchedEmail: email,
        responses: row
      };
      candidate.updatedAt = new Date();
      await candidate.save();
      matchedCount++;
    }

    const message = `Synced ${records.length} form response(s): ${matchedCount} matched to a candidate, ${unmatchedCount} unmatched.`;
    await markRunFinished(run, { status: 'success', totalRows: records.length, matchedCount, unmatchedCount, message });
    return { ran: true, status: 'success', totalRows: records.length, matchedCount, unmatchedCount, message };
  } catch (err) {
    console.error('[FormSync] Run failed:', err);
    await markRunFinished(run, { status: 'failed', message: err.message });
    return { ran: true, status: 'failed', message: err.message };
  }
}

module.exports = { syncFormResponses, isConfigured, configurationReason };
