// Real backend calls. Extend as more endpoints go live.
// request() centralizes error handling: it throws a real, readable Error on both
// network failures AND non-2xx HTTP responses, instead of silently returning a
// generic failure object. Check your browser console for [API] logs when debugging.
const BASE_URL = `${process.env.REACT_APP_API_URL}/api`;

async function request(url, options = {}) {
  let res;
  try {
    res = await fetch(url, options);
  } catch (networkErr) {
    console.error(`[API] Network error calling ${url}:`, networkErr);
    throw new Error(`Could not reach ${url}. Confirm the backend is running and REACT_APP_API_URL matches its port.`);
  }

  let data;
  try {
    data = await res.json();
  } catch (parseErr) {
    console.error(`[API] Non-JSON response from ${url} (status ${res.status})`, parseErr);
    throw new Error(`Server returned an unexpected response (status ${res.status}).`);
  }

  if (!res.ok) {
    console.error(`[API] ${options.method || 'GET'} ${url} → ${res.status}:`, data);
    const err = new Error(data.message || `Request failed with status ${res.status}`);
    err.data = data.data; // lets callers reach structured error detail (e.g. { reasons: [...] })
    throw err;
  }

  return data;
}

// --- Candidates ---
export async function applyCandidate(formData) {
  return request(`${BASE_URL}/candidates/apply`, { method: 'POST', body: formData });
}

export async function bulkUploadResumes(formData) {
  return request(`${BASE_URL}/candidates/bulk-upload-resumes`, { method: 'POST', body: formData });
}

export async function bulkImportWithRole(formData) {
  return request(`${BASE_URL}/candidates/bulk-import-with-role`, { method: 'POST', body: formData });
}

export async function fetchCandidates(filters = {}) {
  const params = new URLSearchParams(
    Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
  ).toString();
  return request(`${BASE_URL}/candidates?${params}`);
}

export async function scoreCandidate(id, payload) {
  return request(`${BASE_URL}/candidates/${id}/score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function analyzeCandidate(id) {
  return request(`${BASE_URL}/candidates/${id}/analyze`, { method: 'POST' });
}

export async function analyzeCandidatesBulk(candidateIds = []) {
  return request(`${BASE_URL}/candidates/analyze-bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ candidateIds })
  });
}

export async function recordInterviewStage(id, payload) 
{ return request(`${BASE_URL}/candidates/${id}/interview-stage`, { 
    method: 'POST', 
    headers: { 'Content-Type': 'application/json' }, 
    body: JSON.stringify(payload) });
 }

// --- Roles ---
export async function fetchRoles() {
  return request(`${BASE_URL}/roles`);
}

export async function createRole(payload) {
  return request(`${BASE_URL}/roles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function deleteRole(code) {
  return request(`${BASE_URL}/roles/${code}`, { method: 'DELETE' });
}

// --- Slack Mappings ---
export async function fetchSlackMappings() {
  return request(`${BASE_URL}/slack-mappings`);
}

export async function createSlackMapping(payload) {
  return request(`${BASE_URL}/slack-mappings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function updateSlackMapping(id, payload) {
  return request(`${BASE_URL}/slack-mappings/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function deleteSlackMapping(id) {
  return request(`${BASE_URL}/slack-mappings/${id}`, { method: 'DELETE' });
}

// --- Auth ---
export async function signup(payload) {
  return request(`${BASE_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function login(payload) {
  return request(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function fetchMe(token) {
  return request(`${BASE_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

// --- Dashboard ---
export async function fetchDashboardMetrics(roleCode) {
  const query = roleCode ? `?roleCode=${encodeURIComponent(roleCode)}` : '';
  return request(`${BASE_URL}/dashboard/metrics${query}`);
}

export async function parseResume(file) {
  const formData = new FormData();
  formData.append('resume', file);
  return request(`${BASE_URL}/candidates/parse-resume`, { method: 'POST', body: formData });
}
export async function bulkImportCandidates(file) {
  const formData = new FormData();
  formData.append('file', file);
  return request(`${BASE_URL}/candidates/bulk-import`, { method: 'POST', body: formData });
}
export async function updateCandidateRecord(id, payload) {
  return request(`${BASE_URL}/candidates/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export const updateCandidate = updateCandidateRecord;

export async function assignCandidatesToSlack(candidateIds, slackMappingId, changedBy) {
  return request(`${BASE_URL}/slack-mappings/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ candidateIds, slackMappingId, changedBy })
  });
}
export async function deleteCandidateRecord(id) {
  return request(`${BASE_URL}/candidates/${id}`, { method: 'DELETE' });
}
// --- Outreach ---
export async function sendOutreachEmail(candidateIds, subject, body, attachments) {
  return request(`${BASE_URL}/outreach/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ candidateIds, subject, body, attachments })
  });
}
export async function fetchRetentionStatus() {
  return request(`${BASE_URL}/retention/status`);
}

export async function runRetentionNow() {
  return request(`${BASE_URL}/retention/run`, { method: 'POST' });
}

// --- Naukri Drive CSV ETL / Import Review ---
export async function fetchEtlStatus() {
  return request(`${BASE_URL}/etl/status`);
}

export async function runEtlNow() {
  return request(`${BASE_URL}/etl/run`, { method: 'POST' });
}

export async function fetchImportReviews(status = 'pending') {
  return request(`${BASE_URL}/etl/reviews?status=${encodeURIComponent(status)}`);
}

export async function approveImportReview(id, rawData, changedBy) {
  return request(`${BASE_URL}/etl/reviews/${id}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawData, changedBy })
  });
}

export async function dismissImportReview(id, changedBy) {
  return request(`${BASE_URL}/etl/reviews/${id}/dismiss`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ changedBy })
  });
}

// --- Google Form response sync ---
export async function fetchFormSyncStatus() {
  return request(`${BASE_URL}/form-sync/status`);
}

export async function runFormSyncNow() {
  return request(`${BASE_URL}/form-sync/run`, { method: 'POST' });
}

export async function fetchGoogleForms() {
  return request(`${BASE_URL}/form-sync/forms`);
}

export async function createGoogleForm(form) {
  return request(`${BASE_URL}/form-sync/forms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(form)
  });
}

export async function updateGoogleForm(id, form) {
  return request(`${BASE_URL}/form-sync/forms/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(form)
  });
}

export async function deleteGoogleForm(id) {
  return request(`${BASE_URL}/form-sync/forms/${id}`, { method: 'DELETE' });
}

// --- Email Templates ---
export async function fetchEmailTemplates() {
  return request(`${BASE_URL}/email-templates`);
}

export async function createEmailTemplate(template) {
  return request(`${BASE_URL}/email-templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(template)
  });
}

export async function updateEmailTemplate(id, template) {
  return request(`${BASE_URL}/email-templates/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(template)
  });
}

export async function deleteEmailTemplate(id) {
  return request(`${BASE_URL}/email-templates/${id}`, { method: 'DELETE' });
}

export async function fetchEmailTemplate(id) {
  return request(`${BASE_URL}/email-templates/${id}`);
}