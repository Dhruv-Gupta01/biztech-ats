import React, { useEffect, useMemo, useState } from 'react';
import { emailTemplates } from '../data/dummyData';
import { fetchCandidates, fetchRoles, sendOutreachEmail, fetchEmailTemplates } from '../api/api';
import TemplateManager from './TemplateManager';

function fillTemplate(str, vars) {
  return str.replace(/{{(.*?)}}/g, (_, key) => vars[key.trim()] ?? `{{${key.trim()}}}`);
}

// Preview-only mirror of the backend's buildFormLink (outreachController.js)
// — the actual send always computes this server-side, per-recipient, from
// the same env vars. This just lets the preview show a realistic link
// instead of a blank/placeholder before anything's actually sent.
function buildFormLinkPreview(email) {
  const baseUrl = process.env.REACT_APP_GOOGLE_FORM_URL;
  const entryId = process.env.REACT_APP_GOOGLE_FORM_EMAIL_ENTRY_ID;
  if (!baseUrl || !entryId || !email) return '';
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}entry.${entryId}=${encodeURIComponent(email)}`;
}

function AssessmentOutreach() {
  const [candidates, setCandidates] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [roleFilter, setRoleFilter] = useState('');
  const [templateId, setTemplateId] = useState(emailTemplates[0].id);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [showTemplateManager, setShowTemplateManager] = useState(false);

  useEffect(() => {
    Promise.all([fetchCandidates(), fetchRoles()])
      .then(([candidatesRes, rolesRes]) => {
        setCandidates(candidatesRes.data);
        setRoles(rolesRes.data);
        if (candidatesRes.data.length > 0) setSelectedIds([candidatesRes.data[0]._id]);
        setLoadError('');
      })
      .catch((err) => { console.error('[AssessmentOutreach] load failed:', err); setLoadError(`Could not load candidates: ${err.message}`); })
      .finally(() => setLoading(false));
  }, []);

  // Fetch templates from API
  const [templates, setTemplates] = useState([]);
  useEffect(() => {
    fetchEmailTemplates()
      .then((res) => {
        if (res.success && res.data.length > 0) {
          setTemplates(res.data);
          setTemplateId(res.data[0]._id);
        } else if (res.success && res.data.length === 0) {
          // If no templates in DB, seed with defaults from dummyData
          setTemplates(emailTemplates);
        }
      })
      .catch((err) => console.error('[AssessmentOutreach] template fetch failed:', err));
  }, []);

  const template = templates.find((t) => t._id === templateId || t.id === templateId);
  const primaryCandidate = candidates.find((c) => c._id === selectedIds[0]) || candidates[0];
  const role = primaryCandidate ? roles.find((r) => r.code === primaryCandidate.roleCode) : null;

  const vars = useMemo(() => {
    if (!primaryCandidate) return { candidateName: '', roleTitle: '', roleCode: '' };
    return {
      candidateName: primaryCandidate.fullName,
      roleTitle: role ? role.title : primaryCandidate.roleCode,
      roleCode: primaryCandidate.roleCode,
      formLink: buildFormLinkPreview(primaryCandidate.email)
    };
  }, [primaryCandidate, role]);

  const previewSubject = useMemo(() => (template ? fillTemplate(template.subject, vars) : ''), [template, vars]);
  const previewBody = useMemo(() => (template ? fillTemplate(template.body, vars) : ''), [template, vars]);

  const toggleCandidate = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSend = async () => {
    if (selectedIds.length === 0 || !template) return;
    setSending(true);
    setSendResult(null);
    try {
      const res = await sendOutreachEmail(selectedIds, template.subject, template.body, template.attachments || []);
      setSendResult({ ok: res.data.failedCount === 0, message: res.message, details: res.data.results });
    } catch (err) {
      setSendResult({ ok: false, message: err.message, details: [] });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <h1 className="page-title">Assessment &amp; Outreach</h1>
      <p className="page-sub">Select candidates, choose a template, and preview personalized outreach before sending — candidate list is live from the database</p>

      {loadError && <div className="alert alert-error">⚠️ {loadError}</div>}
      {sendResult && (
        <div className={`alert ${sendResult.ok ? 'alert-success' : 'alert-error'}`}>
          {sendResult.ok ? '✅' : '⚠️'} {sendResult.message}
          {sendResult.details.some((d) => !d.sent) && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
              {sendResult.details.filter((d) => !d.sent).slice(0, 5).map((d, i) => (
                <li key={i} style={{ fontSize: 12.5 }}>{d.email}: {d.reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--text-500)' }}>Loading candidates...</p>
      ) : candidates.length === 0 ? (
        <p style={{ color: 'var(--text-500)' }}>No candidates in the pool yet — outreach needs at least one candidate to select.</p>
      ) : (
        <div className="outreach-layout">
          <div className="card">
            <h3 style={{ marginTop: 0, fontSize: 14 }}>Select Candidates ({selectedIds.length})</h3>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-500)' }}>Filter by Role Code</label>
              <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid var(--border)', marginTop: 4 }}>
                <option value="">All role codes</option>
                {roles.map((r) => <option key={r.code} value={r.code}>{r.code} — {r.title}</option>)}
              </select>
            </div>
            <div className="candidate-select-list">
              {candidates.filter((c) => !roleFilter || c.roleCode === roleFilter).map((c) => (
                <label key={c._id} className={'candidate-select-item' + (selectedIds.includes(c._id) ? ' selected' : '')}>
                  <input type="checkbox" checked={selectedIds.includes(c._id)} onChange={() => toggleCandidate(c._id)} />
                  <div>
                    <strong>{c.fullName}</strong>
                    <div style={{ fontSize: 11.5, color: 'var(--text-500)' }}>{c.roleCode} · {c.status}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0, fontSize: 14 }}>Email Template Builder</h3>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-500)' }}>Template</label>
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', margin: '6px 0 14px' }}>
              {templates.map((t) => <option key={t._id || t.id} value={t._id || t.id}>{t.name}</option>)}
            </select>

            <div className="template-vars">
              <span className="var-chip">{'{{candidateName}}'}</span>
              <span className="var-chip">{'{{roleTitle}}'}</span>
              <span className="var-chip">{'{{roleCode}}'}</span>
              <span className="var-chip">{'{{formLink}}'}</span>
            </div>

            {primaryCandidate && (
              <>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-500)', marginTop: 10 }}>
                  Preview — {selectedIds.length} recipient{selectedIds.length !== 1 ? 's' : ''} (showing first: {primaryCandidate.fullName})
                </div>
                <div className="email-preview">
                  <strong>Subject:</strong> {previewSubject}
                  {'\n\n'}
                  {previewBody}
                  {template && template.attachments && template.attachments.length > 0 && (
                    <>
                      {'\n\n'}
                      <strong>Attachments:</strong>
                      <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
                        {template.attachments.map((a, i) => (
                          <li key={i}><a href={a.url} target="_blank" rel="noopener noreferrer">{a.name || a.url}</a></li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              </>
            )}

            <div className="actions-row section-gap">
              <button className="btn-primary" onClick={handleSend} disabled={sending || selectedIds.length === 0}>
                {sending ? 'Sending...' : `Send to ${selectedIds.length} Candidate${selectedIds.length !== 1 ? 's' : ''}`}
              </button>
              <button className="btn-secondary" onClick={() => setShowTemplateManager(!showTemplateManager)}>
                {showTemplateManager ? 'Hide Manager' : 'Manage Templates'}
              </button>
            </div>
          </div>

          {showTemplateManager && (
            <div className="card" style={{ marginTop: 20, padding: 20 }}>
              <h4 style={{ marginTop: 0, marginBottom: 15 }}>Email Template Manager</h4>
              <TemplateManager onClose={() => setShowTemplateManager(false)} templates={templates} setTemplates={setTemplates} onTemplateSelect={(id) => setTemplateId(id)} />
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default AssessmentOutreach;