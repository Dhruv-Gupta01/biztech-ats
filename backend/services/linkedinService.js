// LinkedIn job posting integration.
//
// IMPORTANT: LinkedIn does not offer a general self-serve "post a job" API. Job posting
// endpoints live under LinkedIn's Talent Solutions Partner API, which requires:
//   1. A signed LinkedIn Talent Solutions partnership agreement (not just a developer app)
//   2. An OAuth 2.0 access token scoped for job posting, issued to that partnered app
//   3. Your LinkedIn Company/Organization URN
// A personal LinkedIn account token will NOT work for this endpoint.
// Verify the exact endpoint/payload against LinkedIn's current documentation before
// relying on this in production — the shape below follows their documented pattern but
// LinkedIn can revise partner API contracts, and this integration has not been tested
// against a live partner account.
//
// Until you have real partner credentials, this safely no-ops and reports why.

const LINKEDIN_API_URL = 'https://api.linkedin.com/v2/simpleJobPostings';

function mapEmploymentType(type) {
  const map = { 'Full-Time': 'FULL_TIME', 'Part-Time': 'PART_TIME', 'Contract': 'CONTRACT', 'Internship': 'INTERNSHIP' };
  return map[type] || 'FULL_TIME';
}

async function postJobToLinkedIn({ title, description, employmentType }) {
  if (process.env.LINKEDIN_API_ENABLED !== 'true') {
    return { posted: false, reason: 'LinkedIn integration disabled. Set LINKEDIN_API_ENABLED=true in .env once you have partner credentials.' };
  }
  if (!process.env.LINKEDIN_ACCESS_TOKEN || !process.env.LINKEDIN_ORG_ID) {
    return { posted: false, reason: 'Missing LINKEDIN_ACCESS_TOKEN or LINKEDIN_ORG_ID in .env' };
  }

  try {
    const res = await fetch(LINKEDIN_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0'
      },
      body: JSON.stringify({
        integrationContext: `urn:li:organization:${process.env.LINKEDIN_ORG_ID}`,
        companyApplyUrl: process.env.COMPANY_CAREERS_URL || 'https://example.com/careers',
        title,
        description,
        employmentStatus: mapEmploymentType(employmentType),
        listedAt: Date.now()
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { posted: false, reason: (data && data.message) || `LinkedIn API responded with status ${res.status}` };
    }
    return { posted: true, linkedinJobId: (data && data.id) || null };
  } catch (err) {
    return { posted: false, reason: err.message };
  }
}

module.exports = { postJobToLinkedIn };