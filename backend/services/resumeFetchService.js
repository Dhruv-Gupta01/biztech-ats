// Pulls the resume behind a candidate's Google Drive link and extracts its text, for candidates
// imported from the sheet with only a link (no stored resume). Only Google Drive hosts are fetched,
// so a link in candidate data can't make the server request arbitrary URLs.
const pdfParse = require('pdf-parse');

const ALLOWED_HOSTS = new Set(['drive.google.com', 'docs.google.com', 'drive.usercontent.google.com']);
const MAX_BYTES = 10 * 1024 * 1024;
const TIMEOUT_MS = 25000;

function driveFileId(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'https:' || !ALLOWED_HOSTS.has(u.hostname)) return null;
  const m = u.pathname.match(/\/d\/([\w-]+)/);
  return (m && m[1]) || u.searchParams.get('id') || null;
}

// Resolves to { text } or { error } — never throws, so one bad link doesn't fail a batch.
async function fetchResumeText(url) {
  const id = driveFileId(url);
  if (!id) return { error: 'Resume link is not a Google Drive link' };
  try {
    const res = await fetch(`https://drive.google.com/uc?export=download&id=${id}`, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'follow' });
    if (!res.ok) return { error: `Resume link not accessible (HTTP ${res.status})` };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) return { error: 'Resume file is larger than 10 MB' };
    // A non-public file comes back as a Drive HTML page instead of the PDF.
    if (buf.subarray(0, 5).toString() !== '%PDF-') return { error: 'Resume link is not publicly shared or is not a PDF' };
    const parsed = await pdfParse(buf);
    const text = (parsed.text || '').trim();
    return text ? { text } : { error: 'No text could be read from the resume (scanned PDF?)' };
  } catch (err) {
    return { error: `Could not download resume (${err.name === 'TimeoutError' ? 'timed out' : err.message})` };
  }
}

module.exports = { fetchResumeText, driveFileId };
