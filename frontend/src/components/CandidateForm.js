import React, { useEffect, useState } from 'react';
import { applyCandidate, parseResume, fetchRoles } from '../api/api';

const initialState = {
  fullName: '', email: '', phone: '', location: '', roleCode: '',
  employmentType: 'Full-Time', yearsOfExperience: '', ctcCurrent: '',
  ctcExpected: '', noticePeriod: '', skills: '', generalRemarks: '', source: 'Form'
};

// allowManualSource: when true (recruiter context), shows a Source picker so
// staff can tag Manual/Referral additions. Candidates applying themselves never
// see this — their source is always fixed to "Form".
function CandidateForm({ allowManualSource = false }) {
  const [form, setForm] = useState(initialState);
  const [roles, setRoles] = useState([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [rolesError, setRolesError] = useState('');
  const [resume, setResume] = useState(null);
  const [alert, setAlert] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [parsing, setParsing] = useState(false);

  useEffect(() => {
    fetchRoles()
      .then((res) => {
        const openRoles = res.data.filter((r) => r.status !== 'Closed');
        setRoles(openRoles);
        if (openRoles.length > 0) setForm((f) => ({ ...f, roleCode: f.roleCode || openRoles[0].code }));
        setRolesError('');
      })
      .catch((err) => { console.error('[CandidateForm] fetchRoles failed:', err); setRolesError(`Could not load roles: ${err.message}`); })
      .finally(() => setRolesLoading(false));
  }, []);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (file && file.type !== 'application/pdf') {
      setAlert({ type: 'error', message: '⚠️ Only PDF files are allowed for resumes.' });
      e.target.value = '';
      setResume(null);
      return;
    }
    setAlert(null);
    setResume(file);
    if (!file) return;

    setParsing(true);
    try {
      const res = await parseResume(file);
      const extracted = res.data || {};
      let filledAnything = false;

      setForm((prev) => {
        const next = { ...prev };
        if (!prev.fullName && extracted.fullName) { next.fullName = extracted.fullName; filledAnything = true; }
        if (!prev.email && extracted.email) { next.email = extracted.email; filledAnything = true; }
        if (!prev.phone && extracted.phone) { next.phone = extracted.phone; filledAnything = true; }
        if (!prev.skills && extracted.skills && extracted.skills.length > 0) {
          next.skills = extracted.skills.join(', ');
          filledAnything = true;
        }
        return next;
      });

      if (filledAnything) {
        setAlert({ type: 'success', message: '✅ Auto-filled details from your resume — please review before submitting.' });
      } else {
        setAlert(null);
      }
    } catch (err) {
      console.error('[CandidateForm] resume parsing failed:', err);
    } finally {
      setParsing(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!resume) {
      setAlert({ type: 'error', message: '⚠️ Please attach your resume as a PDF.' });
      return;
    }
    if (!form.roleCode) {
      setAlert({ type: 'error', message: '⚠️ Please select a role.' });
      return;
    }
    setSubmitting(true);
    setAlert(null);
    const data = new FormData();
    Object.entries(form).forEach(([k, v]) => data.append(k, v));
    data.append('resume', resume);

    try {
      const result = await applyCandidate(data);
      if (result.success) {
        setAlert({ type: 'success', message: '✅ ' + result.message });
        setForm({ ...initialState, roleCode: roles.length > 0 ? roles[0].code : '' });
        setResume(null);
        document.getElementById('resume-input').value = '';
      } else {
        setAlert({ type: 'error', message: '⚠️ ' + result.message });
      }
    } catch (err) {
      setAlert({ type: 'error', message: `⚠️ ${err.message}` });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <h1 className="page-title">Application Form</h1>
      <p className="page-sub">Upload your resume first — we'll auto-fill what we can from it, then just review and submit</p>

      <div className="card">
        {rolesError && <div className="alert alert-error">⚠️ {rolesError}</div>}
        {alert && <div className={`alert alert-${alert.type}`}>{alert.message}</div>}
        <form onSubmit={handleSubmit} className="form-grid">
          <div className="full">
            <label>Resume (PDF only, max 5MB) *</label>
            <div className="file-drop">
              <input id="resume-input" type="file" accept="application/pdf" onChange={handleFile} required />
              {resume && <div style={{ marginTop: 8, fontWeight: 600 }}>{resume.name}</div>}
              {parsing && <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--text-500)' }}>Reading resume, auto-filling fields...</div>}
            </div>
          </div>

          <div><label>Full Name *</label><input name="fullName" value={form.fullName} onChange={handleChange} required /></div>
          <div><label>Email *</label><input name="email" type="email" value={form.email} onChange={handleChange} required /></div>
          <div><label>Phone *</label><input name="phone" value={form.phone} onChange={handleChange} required /></div>
          <div><label>Location</label><input name="location" value={form.location} onChange={handleChange} /></div>
          <div>
            <label>Role Code *</label>
            <select name="roleCode" value={form.roleCode} onChange={handleChange} disabled={rolesLoading || roles.length === 0}>
              {rolesLoading && <option value="">Loading roles...</option>}
              {!rolesLoading && roles.length === 0 && <option value="">No open roles available</option>}
              {roles.map((r) => <option key={r.code} value={r.code}>{r.code} — {r.title}</option>)}
            </select>
          </div>
          <div>
            <label>Employment Type</label>
            <select name="employmentType" value={form.employmentType} onChange={handleChange}>
              <option>Full-Time</option><option>Part-Time</option><option>Contract</option><option>Internship</option>
            </select>
          </div>
          <div><label>Years of Experience *</label><input name="yearsOfExperience" type="number" min="0" value={form.yearsOfExperience} onChange={handleChange} required /></div>
          <div><label>Notice Period</label><input name="noticePeriod" value={form.noticePeriod} onChange={handleChange} /></div>
          <div><label>Current CTC</label><input name="ctcCurrent" type="number" value={form.ctcCurrent} onChange={handleChange} /></div>
          <div><label>Expected CTC</label><input name="ctcExpected" type="number" value={form.ctcExpected} onChange={handleChange} /></div>

          {allowManualSource && (
            <div>
              <label>Source</label>
              <select name="source" value={form.source} onChange={handleChange}>
                <option value="Manual">Manual</option>
                <option value="Referral">Referral</option>
                <option value="Form">Form</option>
              </select>
            </div>
          )}

          <div className="full"><label>Skills (comma separated) — auto-filled from resume, editable</label><input name="skills" value={form.skills} onChange={handleChange} /></div>
          <div className="full"><label>General Remarks</label><textarea name="generalRemarks" value={form.generalRemarks} onChange={handleChange} /></div>

          <div className="full">
            <button className="btn-primary" type="submit" disabled={submitting || parsing}>
              {submitting ? 'Submitting...' : 'Submit Application'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

export default CandidateForm;