import React, { useEffect, useMemo, useState } from 'react';
import StatusBadge from './StatusBadge';
import CandidateProfileModal from './CandidateProfileModal';
import { fetchCandidates, fetchEmailTemplates, fetchRoles, sendOutreachEmail } from '../api/api';
import TemplateManager from './TemplateManager';
import { effectiveEmploymentType } from '../utils/employment';
import { getColumnsForType } from '../utils/columnOptions';
import { useEmploymentTypes } from '../contexts/EmploymentTypesContext';

function fillTemplate(str, vars) {
  return str.replace(/{{(.*?)}}/g, (_, key) => vars[key.trim()] ?? `{{${key.trim()}}}`);
}

function SkillSearch() {
  const [candidates, setCandidates] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [skillQuery, setSkillQuery] = useState('');
  const [filters, setFilters] = useState({
    roleCode: '',
    employmentType: '',
    statusColumn: '',
    experience: '',
    scoreMin: ''
  });

  const [selectedIds, setSelectedIds] = useState([]);
  const [showDetailModal, setShowDetailModal] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const { typeLabel, employmentTypes } = useEmploymentTypes();
  const [showTemplateManager, setShowTemplateManager] = useState(false);

  useEffect(() => {
    fetchCandidates()
      .then((res) => {
        setCandidates(res.data);
        setLoadError('');
      })
      .catch((err) => {
        console.error('[SkillSearch] load failed:', err);
        setLoadError(`Could not load candidates: ${err.message}`);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchRoles()
      .then((res) => setRoles(res.data))
      .catch((err) => console.error('[SkillSearch] fetchRoles failed:', err));
  }, []);

  useEffect(() => {
    fetchEmailTemplates()
      .then((res) => {
        if (res.success && res.data.length > 0) {
          setTemplates(res.data);
          setTemplateId(res.data[0]._id);
        }
      })
      .catch((err) => console.error('[SkillSearch] template fetch failed:', err));
  }, []);

  const skillsList = useMemo(() => {
    if (!skillQuery.trim()) return [];
    return skillQuery
      .toLowerCase()
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }, [skillQuery]);

  const results = useMemo(() => {
    return candidates.filter((c) => {
      const cSkills = (c.skills || []).map(s => s.toLowerCase().trim());

      const matchesSkills = skillsList.length > 0
        ? skillsList.every(skill => cSkills.some(cs => cs.includes(skill)))
        : true;

      const matchesRoleCode = filters.roleCode
        ? c.roleCode?.toUpperCase() === filters.roleCode.toUpperCase().trim()
        : true;

      const matchesEmploymentType = filters.employmentType
        ? effectiveEmploymentType(c) === filters.employmentType
        : true;

      const matchesExperience = filters.experience
        ? c.yearsOfExperience >= Number(filters.experience)
        : true;

      const matchesScore = filters.scoreMin
        ? (c.score?.suitabilityRating || 0) >= Number(filters.scoreMin)
        : true;

      // "All Status" column filter — same semantics as CandidatePool:
      // a specific value must match exactly; a blank column value means
      // "has any value for that column".
      if (filters.statusColumn) {
        const field = filters.statusColumn;
        let candidateValue;
        if (field === 'status') {
          candidateValue = c.status;
        } else if (field === 'interviewRounds') {
          candidateValue = Object.values(c.interviewRounds || {}).find(v => v && v !== 'Not set');
        } else {
          candidateValue = c[field];
        }
        if (!candidateValue) return false;
      }

      return matchesSkills && matchesRoleCode && matchesEmploymentType && matchesExperience && matchesScore;
    });
  }, [candidates, skillsList, filters]);

  const getStatusDisplay = (c) => {
    const assessmentStatus = c.assessmentStatus || 'Not Set';
    if (assessmentStatus !== 'Not Set') {
      return assessmentStatus;
    }
    return c.status || '—';
  };

  const toggleCandidate = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectAllFiltered = () => {
    setSelectedIds(results.map((c) => c._id));
  };

  const clearSelection = () => setSelectedIds([]);

  const handleSend = async () => {
    if (selectedIds.length === 0 || !templateId) return;
    setSending(true);
    setSendResult(null);
    try {
      const template = templates.find((t) => t._id === templateId);
      const templateLinks = (template?.attachments || [])
        .filter((a) => a.type === 'link' && a.url)
        .map((a) => ({ name: a.name, url: a.url }));
      const templateFileIds = (template?.attachments || [])
        .filter((a) => a.attachmentId)
        .map((a) => a.attachmentId);
      const res = await sendOutreachEmail(
        selectedIds,
        template.subject,
        template.body,
        templateLinks,
        templateFileIds
      );
      setSendResult({ ok: res.data.failedCount === 0, message: res.message, details: res.data.results });
      setSelectedIds([]);
    } catch (err) {
      setSendResult({ ok: false, message: err.message, details: [] });
    } finally {
      setSending(false);
    }
  };

  const buildFormLinkPreview = (email) => {
    const baseUrl = process.env.REACT_APP_GOOGLE_FORM_URL;
    const entryId = process.env.REACT_APP_GOOGLE_FORM_EMAIL_ENTRY_ID;
    if (!baseUrl || !entryId || !email) return '';
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}entry.${entryId}=${encodeURIComponent(email)}`;
  };

  const vars = useMemo(() => {
    const primaryCandidate = candidates.find((c) => c._id === selectedIds[0]) || candidates[0];
    if (!primaryCandidate) return { candidateName: '', roleTitle: '', roleCode: '', formLink: '' };
    return {
      candidateName: primaryCandidate.fullName,
      roleTitle: primaryCandidate.roleCode,
      roleCode: primaryCandidate.roleCode,
      formLink: buildFormLinkPreview(primaryCandidate.email)
    };
  }, [selectedIds, candidates]);

  const previewSubject = useMemo(() => {
    const template = templates.find((t) => t._id === templateId);
    return template ? fillTemplate(template.subject, vars) : '';
  }, [templates, templateId, vars]);

  const previewBody = useMemo(() => {
    const template = templates.find((t) => t._id === templateId);
    return template ? fillTemplate(template.body, vars) : '';
  }, [templates, templateId, vars]);

  const handleClearFilters = () => {
    setSkillQuery('');
    setFilters({
      roleCode: '',
      employmentType: '',
      statusColumn: '',
      experience: '',
      scoreMin: ''
    });
    clearSelection();
  };

  const getResumeUrl = (c) => {
    if (!c.resumeUrl) return null;
    return c.resumeUrl.startsWith('http')
      ? c.resumeUrl
      : `${process.env.REACT_APP_API_URL}${c.resumeUrl}`;
  };

  return (
    <>
      <h1 className="page-title">Skill Search</h1>
      <p className="page-sub">Search candidates by skills — results match against candidate profile skills</p>

      {loadError && <div className="alert alert-error">⚠️ {loadError}</div>}
      {sendResult && (
        <div className={`alert ${sendResult.ok ? 'alert-success' : 'alert-error'}`}>
          {sendResult.ok ? '✅' : '⚠️'} {sendResult.message}
          {sendResult.details && sendResult.details.some((d) => !d.sent) && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
              {sendResult.details.filter((d) => !d.sent).slice(0, 5).map((d, i) => (
                <li key={i} style={{ fontSize: 12.5 }}>{d.email}: {d.reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="filters-row">
        <input
          type="text"
          placeholder="Type skills (comma-separated, e.g. java, sql, react)"
          value={skillQuery}
          onChange={(e) => setSkillQuery(e.target.value)}
          style={{ minWidth: 320 }}
        />
        <select value={filters.employmentType} onChange={(e) => setFilters({ ...filters, employmentType: e.target.value, roleCode: '', statusColumn: '' })}>
          <option value="">All employment types</option>
          {employmentTypes.map((et) => (
            <option key={et.name} value={et.name}>{et.label || et.name}</option>
          ))}
        </select>
        <select value={filters.roleCode} onChange={(e) => setFilters({ ...filters, roleCode: e.target.value, statusColumn: '' })}>
          <option value="">All role codes</option>
          {[...new Set(candidates.map(c => c.roleCode).filter(Boolean))].sort()
            .filter((code) => {
              const codeUpper = code.toUpperCase();
              const et = employmentTypes.find((t) => t.name === filters.employmentType);
              if (et && et.isPrefixBased && et.prefix) return codeUpper.startsWith(String(et.prefix).toUpperCase());
              if (filters.employmentType === 'FREELANCE CODING' || filters.employmentType === 'Contract') return codeUpper.startsWith('F');
              if (filters.employmentType === 'Medical Hiring') return codeUpper.startsWith('M');
              return true;
            })
            .map((code) => <option key={code} value={code}>{code}</option>)}
        </select>
        <select value={filters.statusColumn} onChange={(e) => setFilters({ ...filters, statusColumn: e.target.value })}>
          <option value="">All Status</option>
          {getColumnsForType(filters.employmentType).map((col) => (
            <option key={col.field} value={col.field}>{col.label}</option>
          ))}
        </select>
        <input type="number" min="0" placeholder="Min experience (yrs)" value={filters.experience} onChange={(e) => setFilters({ ...filters, experience: e.target.value })} style={{ width: 130 }} />
        <input type="number" min="0" max="10" placeholder="Min score" value={filters.scoreMin} onChange={(e) => setFilters({ ...filters, scoreMin: e.target.value })} style={{ width: 110 }} />
        <button className="btn-secondary" onClick={handleClearFilters}>Clear</button>
      </div>

      <div className="filters-row">
        <span style={{ fontSize: 13, color: 'var(--text-500)' }}>{selectedIds.length} selected</span>
        <button className="btn-secondary" onClick={selectAllFiltered} disabled={results.length === 0} title="Select all filtered candidates">Select All</button>
        <button className="btn-secondary" onClick={clearSelection} disabled={selectedIds.length === 0}>Clear Selection</button>
        <span style={{ flex: 1 }} />
        <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} disabled={templates.length === 0}>
          <option value="">Select email template</option>
          {templates.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
        </select>
        <button
          className="btn-primary"
          onClick={handleSend}
          disabled={sending || selectedIds.length === 0 || !templateId}
          title={selectedIds.length === 0 ? 'Select at least one candidate' : ''}
        >
          {sending ? 'Sending...' : `Send Email (${selectedIds.length})`}
        </button>
        <button className="btn-secondary" onClick={() => setShowTemplateManager(!showTemplateManager)}>
          {showTemplateManager ? 'Hide Manager' : 'Manage Templates'}
        </button>
      </div>

      {selectedIds.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <h3 style={{ marginTop: 0, fontSize: 14 }}>Email Preview</h3>
          <div style={{ fontSize: 12.5, color: 'var(--text-500)', marginBottom: 8 }}>
            Template: {templates.find((t) => t._id === templateId)?.name || '—'}
          </div>
          <div style={{ background: 'rgba(0,0,0,0.03)', padding: 12, borderRadius: 6, fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap' }}>
            <strong>Subject:</strong> {previewSubject}
            {'\n\n'}
            <strong>Body:</strong>
            {'\n'}
            {previewBody}
            {(() => {
              const template = templates.find((t) => t._id === templateId);
              const allLinks = (template?.attachments || []).filter((a) => a.type === 'link' && a.url);
              if (allLinks.length > 0) {
                return (
                  <>
                    {'\n\nAttachments:\n'}
                    {allLinks.map((a, i) => (
                      <span key={i}>– {a.name || a.url}: {a.url}{i < allLinks.length - 1 ? '\n' : ''}</span>
                    ))}
                  </>
                );
              }
              return null;
            })()}
          </div>
        </div>
      )}

      {showTemplateManager && (
        <TemplateManager
          onClose={() => setShowTemplateManager(false)}
          templates={templates}
          setTemplates={setTemplates}
          onTemplateSelect={(id) => setTemplateId(id)}
        />
      )}

      {loading ? (
        <p style={{ padding: 20, color: 'var(--text-500)' }}>Loading candidates...</p>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th />
                <th>Candidate Name</th>
                <th>Role Code</th>
                <th>Employment Type</th>
                <th>Location</th>
                <th>Last Status</th>
                <th>Resume Link</th>
              </tr>
            </thead>
            <tbody>
              {results.map((c) => (
                <tr key={c._id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(c._id)}
                      onChange={() => toggleCandidate(c._id)}
                    />
                  </td>
                  <td className="name-cell">
                    <button
                      className="name-link"
                      onClick={() => setShowDetailModal(c)}
                      style={{ fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit', textDecoration: 'underline' }}
                    >
                      {c.fullName}
                    </button>
                    <br /><small>{c.email}</small>
                  </td>
                  <td>{c.roleCode}</td>
                  <td>{typeLabel(effectiveEmploymentType(c))}</td>
                  <td>{c.location || '—'}</td>
                  <td><StatusBadge status={getStatusDisplay(c)} label={getStatusDisplay(c)} /></td>
                  <td>
                    {getResumeUrl(c) ? (
                      <a
                        href={getResumeUrl(c)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="name-link"
                        style={{ textDecoration: 'underline' }}
                      >
                        View Resume
                      </a>
                    ) : (
                      <span style={{ color: 'var(--text-500)', fontSize: 12 }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {results.length === 0 && <p style={{ padding: 20, color: 'var(--text-500)' }}>No candidates match these filters.</p>}
        </div>
      )}

      {showDetailModal && (
        <CandidateProfileModal
          candidate={showDetailModal}
          role={roles.find((r) => r.code === showDetailModal.roleCode)}
          onClose={() => setShowDetailModal(null)}
          onSaved={(updated) => {
            setCandidates((prev) => prev.map((c) => (c._id === updated._id ? updated : c)));
            setShowDetailModal(updated);
          }}
        />
      )}
    </>
  );
}

export default SkillSearch;
