// Google Drive integration, shared by two features: the daily Naukri CSV
// import and the Google Form response sync. Both reuse the same service
// account credentials; each has its own isConfigured()-style check for the
// resource it needs beyond that (a Drive folder vs. a response Sheet).
//
// Auth is a Google Cloud service account (not OAuth) — the right pattern for
// an unattended 9am cron job, since it has no expiring user consent to renew.
// Setup:
//   1. Create a service account in Google Cloud Console, download its JSON key.
//   2. Put the key on this server, then set EITHER:
//        GOOGLE_SERVICE_ACCOUNT_KEY_FILE = absolute path to the key file, OR
//        GOOGLE_SERVICE_ACCOUNT_KEY      = the key file's full JSON, one line
//   3. Share the Drive folder recruiters upload into with the service
//      account's `client_email` (found in the key JSON) — same as sharing a
//      folder with a coworker. Grant "Editor" so it can move the processed file.
//   4. Set GOOGLE_DRIVE_FOLDER_ID to that folder's ID (from its Drive URL).
//
// Until all of that is configured, every function below safely reports why
// instead of throwing — same no-op-until-configured pattern as
// linkedinService.js / emailService.js.

const { google } = require('googleapis');

const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive'];
const PROCESSED_FOLDER_NAME = 'processed';

function hasCredentials() {
  return !!(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
}

// Naukri-import-specific: credentials + the Drive folder recruiters upload
// into. formSyncService has its own isConfigured() check (credentials + a
// response Sheet ID instead) since the two features share auth but not config.
function isConfigured() {
  return hasCredentials() && !!process.env.GOOGLE_DRIVE_FOLDER_ID;
}

function configurationReason() {
  const missing = [];
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE && !process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    missing.push('GOOGLE_SERVICE_ACCOUNT_KEY_FILE or GOOGLE_SERVICE_ACCOUNT_KEY');
  }
  if (!process.env.GOOGLE_DRIVE_FOLDER_ID) missing.push('GOOGLE_DRIVE_FOLDER_ID');
  return `Missing ${missing.join(' and ')} in .env.`;
}

let cachedDrive = null;

function getDriveClient() {
  if (cachedDrive) return cachedDrive;

  let auth;
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE) {
    auth = new google.auth.GoogleAuth({ keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE, scopes: DRIVE_SCOPES });
  } else {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    auth = new google.auth.GoogleAuth({ credentials, scopes: DRIVE_SCOPES });
  }

  cachedDrive = google.drive({ version: 'v3', auth });
  return cachedDrive;
}

// Returns the most recently modified CSV directly inside folderId (not
// recursive — a file inside the processed/ subfolder is a different parent
// and won't show up here, which is what keeps already-imported files from
// being picked up again). Returns null if nothing's there.
async function findNewestCsv(folderId) {
  const drive = getDriveClient();
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
    orderBy: 'modifiedTime desc',
    fields: 'files(id, name, modifiedTime, mimeType)',
    pageSize: 20
  });
  const files = (res.data.files || []).filter(
    (f) => f.mimeType === 'text/csv' || f.name.toLowerCase().endsWith('.csv')
  );
  return files.length > 0 ? files[0] : null;
}

async function downloadFileText(fileId) {
  const drive = getDriveClient();
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
  return Buffer.from(res.data).toString('utf-8');
}

// Google Sheets aren't regular binary files — they need `files.export`
// (files.get with alt=media only works on uploaded files, not Google-native
// docs/sheets). Used to read a Google Form's linked response Sheet. Exports
// only the sheet's first tab, which is exactly what a Form's response Sheet
// is (Forms always writes to the first/only tab it creates).
async function downloadSheetAsCsvText(fileId) {
  const drive = getDriveClient();
  const res = await drive.files.export({ fileId, mimeType: 'text/csv' }, { responseType: 'arraybuffer' });
  return Buffer.from(res.data).toString('utf-8');
}

async function findOrCreateProcessedFolder(parentFolderId) {
  const drive = getDriveClient();
  const existing = await drive.files.list({
    q: `'${parentFolderId}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder' and name = '${PROCESSED_FOLDER_NAME}'`,
    fields: 'files(id, name)',
    pageSize: 1
  });
  if (existing.data.files && existing.data.files.length > 0) return existing.data.files[0].id;

  const created = await drive.files.create({
    requestBody: { name: PROCESSED_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder', parents: [parentFolderId] },
    fields: 'id'
  });
  return created.data.id;
}

// Moves the source file into <parentFolderId>/processed/, renaming it with a
// date prefix so the audit trail in Drive stays sorted and unambiguous even
// if the same filename gets re-uploaded on a later day.
async function moveFileToProcessed(fileId, fileName, parentFolderId) {
  const drive = getDriveClient();
  const processedFolderId = await findOrCreateProcessedFolder(parentFolderId);
  const datePrefix = new Date().toISOString().slice(0, 10);
  await drive.files.update({
    fileId,
    addParents: processedFolderId,
    removeParents: parentFolderId,
    requestBody: { name: `${datePrefix}-${fileName}` },
    fields: 'id, parents'
  });
}

module.exports = {
  hasCredentials,
  isConfigured,
  configurationReason,
  findNewestCsv,
  downloadFileText,
  downloadSheetAsCsvText,
  moveFileToProcessed
};
