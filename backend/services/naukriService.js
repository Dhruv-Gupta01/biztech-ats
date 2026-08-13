// Naukri.com job posting integration.
//
// IMPORTANT — same situation as LinkedIn: Naukri does not offer a public
// self-serve "post a job" API for individual developers. Job posting on
// Naukri goes through their Recruiter/RMS (Resume Management System) partner
// program, which requires:
//   1. A corporate Naukri Recruiter/Employer account with an assigned account manager
//   2. API credentials (client ID/secret or API key) issued specifically through
//      that partnership — not available via public signup
//   3. Your Naukri Recruiter/Company ID
// I have not verified the exact current endpoint or payload shape against
// Naukri's live partner documentation — unlike LinkedIn's REST API, Naukri's
// integration contract is not well-documented publicly, so treat the request
// shape below as a reasonable placeholder to adapt once you have real partner
// docs in hand, not a confirmed-working contract.
//
// Until real credentials are configured, this safely no-ops and reports why —
// identical fallback behavior to postJobToLinkedIn(), so role creation is
// never blocked by this integration being unavailable.

const NAUKRI_API_URL = process.env.NAUKRI_API_URL || 'https://api.naukri.com/rms/jobs'; // placeholder — confirm with Naukri partner docs

function mapEmploymentType(type) {
  const map = { 'Full-Time': 'Full Time', 'Part-Time': 'Part Time', 'Contract': 'Contractual', 'Internship': 'Internship' };
  return map[type] || 'Full Time';
}

async function postJobToNaukri({ title, description, employmentType, department }) {
  if (process.env.NAUKRI_API_ENABLED !== 'true') {
    return { posted: false, reason: 'Naukri integration disabled. Set NAUKRI_API_ENABLED=true in .env once you have partner credentials from your Naukri account manager.' };
  }
  if (!process.env.NAUKRI_API_KEY || !process.env.NAUKRI_RECRUITER_ID) {
    return { posted: false, reason: 'Missing NAUKRI_API_KEY or NAUKRI_RECRUITER_ID in .env' };
  }

  try {
    const res = await fetch(NAUKRI_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.NAUKRI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        recruiterId: process.env.NAUKRI_RECRUITER_ID,
        jobTitle: title,
        jobDescription: description,
        employmentType: mapEmploymentType(employmentType),
        department,
        applyUrl: process.env.COMPANY_CAREERS_URL || 'https://example.com/careers'
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { posted: false, reason: (data && data.message) || `Naukri API responded with status ${res.status}` };
    return { posted: true, naukriJobId: (data && data.jobId) || null };
  } catch (err) {
    return { posted: false, reason: err.message };
  }
}

module.exports = { postJobToNaukri };