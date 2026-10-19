import React, { useEffect, useState } from 'react';
import StatusBadge from './StatusBadge';
import { updateCandidate, fetchProjects } from '../api/api';
import { effectiveEmploymentType, typeLabel, isFreelanceRoleCode, isFreelanceCandidate } from '../utils/employment';

const money = (n) => (n ? `₹${(n / 100000).toFixed(1)}L` : '—');

const SCREENING_INTERVIEW_OPTIONS = ['Pass', 'Fail', 'Not Appeared', 'Rescheduled', 'Not interested', 'Referred to another position'];
const CALENDLY_SENT_OPTIONS = ['Sent', 'Not Sent'];
const CALENDLY_STATUS_OPTIONS = ['Booked', 'Not Booked'];
const NDA_ICA_OPTIONS = ['Sent', 'Not Sent', 'Signed', 'Not Signed', 'Doubt', 'Not Interested'];
const SLACK_STATUS_OPTIONS = ['Joined', 'Not Joined', 'Not Interested'];
const BOOTCAMP_ATTEMPTS_OPTIONS = ['Attempt 1', 'Attempt 2', 'Attempt 3'];
const BOOTCAMP_STATUS_OPTIONS = ['Pass', 'Fail', 'Full Fail', 'Not Active', 'Active'];
const ONBOARDING_OPTIONS = ['Sent', 'Not Sent', 'Not Interested', 'Done'];
const PROJECT_STATUS_OPTIONS = ['On Hold', 'Complete', 'Not Active', 'In Pipeline'];
const DEFAULT_PROJECTS = ['Terminus', 'Snorkle', 'Alegion'];

// Field order matches the Candidate Pool table columns for FREELANCE CODING.
const FREELANCE_FIELDS = [
  { key: 'calendlyLinkSent', label: 'Calendly Link Sent', options: CALENDLY_SENT_OPTIONS },
  { key: 'calendlyLinkStatus', label: 'Calendly Link Status', options: CALENDLY_STATUS_OPTIONS },
  { key: 'screeningInterview', label: 'Screening Interview', options: SCREENING_INTERVIEW_OPTIONS },
  { key: 'ndaIca', label: 'NDA & ICA', options: NDA_ICA_OPTIONS },
  { key: 'slackStatus', label: 'Slack', options: SLACK_STATUS_OPTIONS },
  { key: 'bootcampAttempts', label: 'Bootcamp Attempts', options: BOOTCAMP_ATTEMPTS_OPTIONS },
  { key: 'bootcampStatus', label: 'Bootcamp Status', options: BOOTCAMP_STATUS_OPTIONS },
  { key: 'onboarding', label: 'Onboarding', options: ONBOARDING_OPTIONS },
  { key: 'projectStatus', label: 'Project Status', options: PROJECT_STATUS_OPTIONS }
];

const NON_ANSWER_FIELDS = ['Timestamp', 'Email Address'];

function Field({ label, children }) {
  return (
    <div className="profile-field">
      <label>{label}</label>
      <div>{children ?? '—'}</div>
    </div>
  );
}

function CandidateProfileModal({ candidate, role, onClose, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(null);
  const [projects, setProjects] = useState(DEFAULT_PROJECTS);

  // Project list is shared with the Candidate Pool — anything added there (or
  // here) is stored in the DB and shows up everywhere.
  useEffect(() => {
    fetchProjects()
      .then((res) => {
        const list = (res.data || []).map((p) => p.name).filter(Boolean);
        setProjects([...new Set([...DEFAULT_PROJECTS, ...list])]);
      })
      .catch(() => {});
  }, []);

  if (!candidate) return null;
  const c = candidate;

  const startEdit = () => {
    setForm({
      fullName: c.fullName || '',
      email: c.email || '',
      phone: c.phone || '',
      location: c.location || '',
      resumeUrl: c.resumeUrl || '',
      employmentType: effectiveEmploymentType(c) || 'Full-Time',
      yearsOfExperience: c.yearsOfExperience ?? 0,
      ctcCurrent: c.ctcCurrent || 0,
      ctcExpected: c.ctcExpected || 0,
      noticePeriod: c.noticePeriod || '',
      roleCode: c.roleCode || '',
      status: c.status || '',
      // FREELANCE CODING columns
      screeningInterview: c.screeningInterview || '',
      calendlyLinkSent: c.calendlyLinkSent || '',
      calendlyLinkStatus: c.calendlyLinkStatus || '',
      ndaIca: c.ndaIca || '',
      slackStatus: c.slackStatus || '',
      bootcampAttempts: c.bootcampAttempts || '',
      bootcampStatus: c.bootcampStatus || '',
      onboarding: c.onboarding || '',
      project: c.project || '',
      projectStatus: c.projectStatus || ''
    });
    setEditing(true);
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const res = await updateCandidate(c._id, { ...form, changedBy: 'Recruiter' });
      onSaved?.(res.data);
      setEditing(false);
    } catch (err) {
      console.error('Failed to update candidate:', err);
      alert('Could not save changes: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    setEditing(false);
    setForm(null);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 style={{ margin: '0 0 4px', fontFamily: 'var(--font-display)', fontSize: 19 }}>{c.fullName}</h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <StatusBadge status={c.status} />
              <span style={{ fontSize: 12.5, color: 'var(--text-500)' }}>{c.roleCode} · {typeLabel(effectiveEmploymentType(c))}</span>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {!editing ? (
            <>
              <div className="profile-section">
                <h4>Contact</h4>
                <div className="profile-grid">
                  <Field label="Email">{c.email}</Field>
                  <Field label="Phone">{c.phone}</Field>
                  <Field label="Resume Link">
                    {c.resumeUrl ? (
                      <a
                        href={c.resumeUrl.startsWith('http') ? c.resumeUrl : `${process.env.REACT_APP_API_URL}${c.resumeUrl}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--primary)', textDecoration: 'underline', cursor: 'pointer' }}
                      >
                        {c.resumeUrl}
                      </a>
                    ) : (
                      <span style={{ color: 'var(--text-500)' }}>—</span>
                    )}
                  </Field>
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
                {isFreelanceCandidate(c) && (
                  <div className="profile-grid" style={{ marginTop: 10 }}>
                    <Field label="Screening Interview">{c.screeningInterview || '—'}</Field>
                    <Field label="Calendly Link Sent">{c.calendlyLinkSent || '—'}</Field>
                    <Field label="Calendly Link Status">{c.calendlyLinkStatus || '—'}</Field>
                    <Field label="NDA & ICA">{c.ndaIca || '—'}</Field>
                    <Field label="Slack Status">{c.slackStatus || '—'}</Field>
                    <Field label="Bootcamp Attempts">{c.bootcampAttempts || '—'}</Field>
                    <Field label="Bootcamp Status">{c.bootcampStatus || '—'}</Field>
                    <Field label="Onboarding">{c.onboarding || '—'}</Field>
                    <Field label="Project">{c.project || '—'}</Field>
                    <Field label="Project Status">{c.projectStatus || '—'}</Field>
                  </div>
                )}
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

              <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button className="btn-secondary" onClick={onClose}>Close</button>
                <button className="btn-primary" onClick={startEdit}>Edit Profile</button>
              </div>
            </>
          ) : (
            <div className="profile-section">
              <h4>Edit Candidate</h4>
              <div className="profile-grid">
                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-500)' }}>Full Name</label>
                  <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--border)', marginTop: 4 }} />
                </div>
                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-500)' }}>Email</label>
                  <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--border)', marginTop: 4 }} />
                </div>
<div>
                      <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-500)' }}>Phone</label>
                      <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--border)', marginTop: 4 }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-500)' }}>Resume Link</label>
                      <input value={form.resumeUrl || ''} onChange={(e) => setForm({ ...form, resumeUrl: e.target.value })} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--border)', marginTop: 4 }} placeholder="https://..." />
                    </div>
                    <div>
                      <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-500)' }}>Location</label>
                  <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--border)', marginTop: 4 }} />
                </div>
                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-500)' }}>Role Code</label>
                  <input value={form.roleCode} onChange={(e) => setForm({ ...form, roleCode: e.target.value.toUpperCase().trim() })} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--border)', marginTop: 4 }} />
                </div>
                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-500)' }}>Employment Type</label>
                  <select value={form.employmentType} onChange={(e) => setForm({ ...form, employmentType: e.target.value })} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--border)', marginTop: 4 }}>
                    <option value="Full-Time">Full Time</option>
                    <option value="Contract">Contractual</option>
                    <option value="Part-Time">Part Time</option>
                    <option value="Internship">Internship</option>
                    <option value="FREELANCE CODING">Freelance Coding</option>
                  </select>
                  {isFreelanceRoleCode(form.roleCode) && (
                    <p style={{ fontSize: 11, color: 'var(--text-500)', margin: '4px 0 0' }}>
                      Role codes starting with “F” are always Freelance Coding.
                    </p>
                  )}
                </div>
                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-500)' }}>Years of Experience</label>
                  <input type="number" min="0" value={form.yearsOfExperience} onChange={(e) => setForm({ ...form, yearsOfExperience: Number(e.target.value) })} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--border)', marginTop: 4 }} />
                </div>
                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-500)' }}>Current CTC (₹)</label>
                  <input type="number" min="0" value={form.ctcCurrent} onChange={(e) => setForm({ ...form, ctcCurrent: Number(e.target.value) })} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--border)', marginTop: 4 }} />
                </div>
                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-500)' }}>Expected CTC (₹)</label>
                  <input type="number" min="0" value={form.ctcExpected} onChange={(e) => setForm({ ...form, ctcExpected: Number(e.target.value) })} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--border)', marginTop: 4 }} />
                </div>
                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-500)' }}>Notice Period</label>
                  <input value={form.noticePeriod} onChange={(e) => setForm({ ...form, noticePeriod: e.target.value })} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--border)', marginTop: 4 }} />
                </div>
                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-500)' }}>Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--border)', marginTop: 4 }}>
                     {['Information Form Response','Interview 1','Interview 1 Shortlisted','Interview 2','Interview 2 Shortlisted','Assessment 1','Assessment 1 Shortlisted','Assessment 1 Passed','Assessment 2','Assessment 2 Shortlisted','Assessment 2 Passed','Final Round Shortlisted','Selected','Rejected','Not Appeared','Rescheduled','Refered for other position','Not interested'].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {isFreelanceCandidate(c) && (
                <>
                  <h4 style={{ margin: '22px 0 10px', fontSize: 13.5, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                    Freelance Coding Pipeline
                  </h4>
                  <div className="profile-grid">
                    {FREELANCE_FIELDS.map(({ key, label, options }) => (
                      <div key={key}>
                        <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-500)' }}>{label}</label>
                        <select value={form[key] || ''} onChange={(e) => setForm({ ...form, [key]: e.target.value })} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--border)', marginTop: 4 }}>
                          <option value="">—</option>
                          {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                        {key === 'calendlyLinkStatus' && (
                          <p style={{ fontSize: 11, color: 'var(--text-500)', margin: '4px 0 0' }}>
                            Use “↻ Check Calendly” in the Candidate Pool table to fetch this from Calendly.
                          </p>
                        )}
                      </div>
                    ))}
                    <div>
                      <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-500)' }}>Project</label>
                      <select value={form.project || ''} onChange={(e) => setForm({ ...form, project: e.target.value })} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--border)', marginTop: 4 }}>
                        <option value="">—</option>
                        {projects.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                  </div>
                </>
              )}

              <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button className="btn-secondary" onClick={cancel} disabled={saving}>Cancel</button>
                <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CandidateProfileModal;
