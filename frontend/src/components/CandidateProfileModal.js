import React, { useState } from 'react';
import StatusBadge from './StatusBadge';
import { updateCandidate } from '../api/api';

const typeLabel = (t) => (t === 'Contract' ? 'Contractual' : t === 'Part-Time' ? 'Part Time' : t === 'Internship' ? 'Internship' : 'Full Time');
const money = (n) => (n ? `₹${(n / 100000).toFixed(1)}L` : '—');

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

  if (!candidate) return null;
  const c = candidate;

  const startEdit = () => {
    setForm({
      fullName: c.fullName || '',
      email: c.email || '',
      phone: c.phone || '',
      location: c.location || '',
      employmentType: c.employmentType || 'Full-Time',
      yearsOfExperience: c.yearsOfExperience ?? 0,
      ctcCurrent: c.ctcCurrent || 0,
      ctcExpected: c.ctcExpected || 0,
      noticePeriod: c.noticePeriod || '',
      roleCode: c.roleCode || '',
      status: c.status || ''
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
              <span style={{ fontSize: 12.5, color: 'var(--text-500)' }}>{c.roleCode} · {typeLabel(c.employmentType)}</span>
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
                  </select>
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
                     {['Information Form Response','Interview 1','Interview 1 Shortlisted','Interview 2','Interview 2 Shortlisted','Assessment 1','Assessment 1 Shortlisted','Assessment 1 Passed','Assessment 2','Assessment 2 Shortlisted','Assessment 2 Passed','Final Round Shortlisted','Selected','Rejected'].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

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
