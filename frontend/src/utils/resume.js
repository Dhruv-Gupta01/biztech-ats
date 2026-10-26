// Resume links are either full URLs (e.g. Drive links from imports) or backend-relative
// paths (/api/candidates/:id/resume for uploaded PDFs).
export const resumeHref = (resumeUrl) =>
  !resumeUrl ? '' : (resumeUrl.startsWith('http') ? resumeUrl : `${process.env.REACT_APP_API_URL}${resumeUrl}`);
