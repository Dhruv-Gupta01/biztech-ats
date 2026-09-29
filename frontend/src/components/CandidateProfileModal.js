import React from 'react';
import StatusBadge from './StatusBadge';

const typeLabel = (t) => (t === 'Contract' ? 'Contractual' : t === 'Part-Time' ? 'Part Time' : t === 'Internship' ? 'Internship' : 'Full Time');
const money = (n) => (n ? `₹${(n / 100000).toFixed(1)}L` : '—');

// Fields Google Forms adds/echoes back that aren't a real form question —
// hidden from the answers list so the profile shows only what the candidate
// actually answered.
const NON_ANSWER_FIELDS = ['Timestamp', 'Email Address'];

function Field({ label, children }) {
  return (
    <div className="profile-field">
      <label>{label}</label>
      <div>{children ?? '—'}</div>
    </div>
  );
}

// Read-only detail view for one candidate — contact info, pipeline/assessment
// state, interview progress, change history, and (if one has been synced)
// their Google Form submission. Opened by clicking a candidate's name in the
// Candidate Pool table; the candidate list already has everything shown here
// as part of the normal GET /api/candidates response, so this needs no
// separate fetch.
function CandidateProfileModal({ candidate, role, onClose }) {
  if (!candidate) return null;
  const c = candidate;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 style={{ margin: '0 0 4px', fontFamily: 'var(--font-display)', fontSize: 19 }}>{c.fullName}</h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <StatusBadge status={c.status} />
              <span style={{ fontSize: 12.5, color: 'var(--text-500)' }}>{c.roleCode} · {typeLabel(c.employmentType)}</span>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="profile-section">
            <h4>Contact</h4>
            <div className="profile-grid">
              <Field label="Email">{c.email}</Field>
              <Field label="Phone">{c.phone}</Field>
              <Field label="Location">{c.location}</Field>
              <Field label="Source">{c.source}</Field>
            </div>
          </div>

          <div className="profile-section">
            <h4>Application</h4>
            <div className="profile-grid">
              <Field label="Experience">{c.yearsOfExperience} yr(s)</Field>
              <Field label="CTC (Current → Expected)">{money(c.ctcCurrent)} → {money(c.ctcExpected)}</Field>
              <Field label="Notice Period">{c.noticePeriod}</Field>
              <Field label="Slack Group">{c.slackGroup}</Field>
            </div>
            {c.skills?.length > 0 && (
              <div style={{ marginTop: 10 }}>
                {c.skills.map((s) => <span key={s} className="tag">{s}</span>)}
              </div>
            )}
          </div>

          <div className="profile-section">
            <h4>Google Form Submissions</h4>
            {(c.formSubmissions || []).length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-500)' }}>
                No form submission synced yet. Send this candidate an outreach email with the assessment form link, then use "Sync Form Responses" on the Candidate Pool page once they've submitted it.
              </p>
            ) : (
              (c.formSubmissions || []).map((submission, idx) => (
                <div key={submission.formId + idx} style={{ marginBottom: 16, padding: 12, border: '1px solid var(--border)', borderRadius: 6 }}>
                  <p style={{ fontSize: 12, color: 'var(--text-500)', margin: '0 0 10px' }}>
                    <strong>{submission.formName || 'Form'}</strong> — Submitted {new Date(submission.submittedAt).toLocaleString()} · matched by {submission.matchedEmail}
                  </p>
                  {Object.entries(submission.responses || {})
                    .filter(([key]) => !NON_ANSWER_FIELDS.includes(key))
                    .map(([key, value]) => (
                      <div key={key} className="profile-answer">
                        <strong>{key}</strong>
                        {String(value) || '—'}
                      </div>
                    ))}
                </div>
              ))
            )}
          </div>

          {c.history?.length > 0 && (
            <div className="profile-section">
              <h4>Change History</h4>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {[...c.history].reverse().map((h, i) => (
                  <li key={i} style={{ fontSize: 12.5, marginBottom: 3 }}>
                    <strong>{h.field}</strong>: "{String(h.oldValue) || '—'}" → "{String(h.newValue)}" — {h.changedBy} · {new Date(h.changedAt).toLocaleString()}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CandidateProfileModal;
