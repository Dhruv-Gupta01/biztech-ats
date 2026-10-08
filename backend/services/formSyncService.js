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
const GoogleForm = require('../models/GoogleForm');
const drive = require('./googleDriveService');

const DEFAULT_EMAIL_COLUMN = 'Email Address';
const FALLBACK_EMAIL_COLUMNS = ['Email', 'Email Address', 'Candidate Email', 'Email ID', 'email'];

function findEmailColumn(record) {
  if (!record || typeof record !== 'object') return null;
  const keys = Object.keys(record);
  for (const col of FALLBACK_EMAIL_COLUMNS) {
    if (keys.includes(col)) return col;
  }
  return null;
}

function parseSheetTimestamp(text) {
  const match = String(text || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!match) return new Date();
  const [, day, month, year, hour, minute, second] = match.map(Number);
  const date = new Date(year, month - 1, day, hour, minute, second);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function isConfigured() {
  return drive.hasCredentials() && GoogleForm.find({ isActive: true }).count !== undefined;
}

function configurationReason() {
  const missing = [];
  if (!drive.hasCredentials()) missing.push('GOOGLE_SERVICE_ACCOUNT_KEY_FILE or GOOGLE_SERVICE_ACCOUNT_KEY');
  return `Missing ${missing.join(' and ')} in .env.`;
}

async function markRunFinished(run, fields) {
  run.finishedAt = new Date();
  Object.assign(run, fields);
  await run.save();
  return run;
}

async function syncFormResponses() {
  if (process.env.FORM_SYNC_ENABLED !== 'true') {
    return { ran: false, reason: 'Form response sync disabled. Set FORM_SYNC_ENABLED=true in .env.' };
  }
  if (!drive.hasCredentials()) {
    return { ran: false, reason: configurationReason() };
  }

  const forms = await GoogleForm.find({ isActive: true });
  if (forms.length === 0) {
    return { ran: false, reason: 'No active Google Forms configured. Add forms in the admin panel.' };
  }

  const run = await FormSyncRun.create({ status: 'running', formsProcessed: 0 });
  let totalMatched = 0;
  let totalUnmatched = 0;
  const formResults = [];

  for (const form of forms) {
    const formRun = await FormSyncRun.create({ status: 'running', formId: form._id, formName: form.name });

    try {
      const csvText = await drive.downloadSheetAsCsvText(form.responseSheetId);

      let records;
      try {
        records = parse(csvText, { columns: true, skip_empty_lines: true, trim: true });
      } catch (parseErr) {
        await markRunFinished(formRun, { status: 'failed', message: `Could not parse response Sheet: ${parseErr.message}` });
        formResults.push({ form: form.name, status: 'failed', reason: parseErr.message });
        continue;
      }

      if (records.length > 0) {
        const detectedColumn = findEmailColumn(records[0]);
        if (!detectedColumn) {
          await markRunFinished(formRun, { status: 'failed', message: `No email column found. Columns: ${Object.keys(records[0]).join(', ')}` });
          formResults.push({ form: form.name, status: 'failed', reason: 'No email column found' });
          continue;
        }
        console.log(`[FormSync] Form "${form.name}" columns: ${Object.keys(records[0]).join(', ')}`);
        console.log(`[FormSync] Form "${form.name}" using email column: ${detectedColumn}`);
      }

      const emailColumn = records.length > 0 ? findEmailColumn(records[0]) : DEFAULT_EMAIL_COLUMN;
      let matchedCount = 0;
      let unmatchedCount = 0;
      let skippedEmptyEmail = 0;

      console.log(`[FormSync] Processing ${records.length} rows from form "${form.name}"`);

      for (const row of records) {
        const email = (row[emailColumn] || '').trim().toLowerCase();
        if (!email) { skippedEmptyEmail++; continue; }

        const candidate = await Candidate.findOne({ email });
        if (!candidate) { unmatchedCount++; continue; }

        const submission = {
          formId: String(form._id),
          formName: form.name,
          submittedAt: parseSheetTimestamp(row['Timestamp']),
          matchedEmail: email,
          responses: row
        };

        const updates = {
          $push: { formSubmissions: submission },
          $set: { updatedAt: new Date() }
        };

        const currentStatus = candidate.status;
        if (!currentStatus || currentStatus === 'Information Form Response' || currentStatus === '') {
          updates.$set.status = 'Information Form Response';
        }

        await Candidate.updateOne({ _id: candidate._id }, updates);
        matchedCount++;
      }

      totalMatched += matchedCount;
      totalUnmatched += unmatchedCount;

      const message = records.length === 0
        ? `Form "${form.name}" response sheet is empty. No submissions found.`
        : `Synced ${records.length} response(s): ${matchedCount} matched, ${unmatchedCount} unmatched (${skippedEmptyEmail} empty emails).`;
      console.log(`[FormSync] ${message}`);
      await markRunFinished(formRun, { status: 'success', totalRows: records.length, matchedCount, unmatchedCount, skippedEmptyEmail, message });
      formResults.push({ form: form.name, status: 'success', matchedCount, unmatchedCount, skippedEmptyEmail, totalRows: records.length });
    } catch (err) {
      console.error(`[FormSync] Run failed for form ${form.name}:`, err);
      await markRunFinished(formRun, { status: 'failed', message: err.message });
      formResults.push({ form: form.name, status: 'failed', reason: err.message });
    }
  }

  const hasAnyRows = formResults.some(fr => fr.totalRows > 0);
  const overallMessage = hasAnyRows
    ? `Synced ${forms.length} form(s): ${totalMatched} matched, ${totalUnmatched} unmatched.`
    : `Synced ${forms.length} form(s), but no response rows were found in any form. Check that the forms have submissions and the response Sheet IDs are correct.`;
  console.log(`[FormSync] Overall: ${overallMessage}`);
  await markRunFinished(run, { status: 'success', formsProcessed: forms.length, totalMatched, totalUnmatched, message: overallMessage, formResults });

  return { ran: true, status: 'success', formsProcessed: forms.length, totalMatched, totalUnmatched, message: overallMessage, formResults };
}

module.exports = { syncFormResponses, isConfigured, configurationReason };

