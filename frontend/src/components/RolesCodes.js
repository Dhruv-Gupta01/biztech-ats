import React, { useEffect, useState } from 'react';
import { fetchRoles, createRole, deleteRole, fetchRetentionStatus, runRetentionNow } from '../api/api';
import { isFreelanceRoleCode, isMedicalRoleCode, typeLabel } from '../utils/employment';
import { useEmploymentTypes } from '../contexts/EmploymentTypesContext';

const emptyForm = { code: '', title: '', department: '', description: '', empType: 'Full-Time', openings: 1, skills: '', minExperience: '', notNegotiable: false };

function RolesCodes() {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [retention, setRetention] = useState(null);
  const [retentionRunning, setRetentionRunning] = useState(false);
  const [retentionResult, setRetentionResult] = useState(null);

  // Employment type management state
  const [showEmpTypeModal, setShowEmpTypeModal] = useState(false);
  const [empTypeForm, setEmpTypeForm] = useState({ name: '', label: '', prefix: '', isPrefixBased: false, sortOrder: 0, description: '' });
  const [empTypeError, setEmpTypeError] = useState('');
  const [empTypeLoading, setEmpTypeLoading] = useState(false);

  const { employmentTypes, createEmploymentType, deleteEmploymentType, deactivateEmploymentType } = useEmploymentTypes();

  const loadRoles = () => {
    setLoading(true);
    fetchRoles()
      .then((res) => { setRoles(res.data); setError(''); })
      .catch((err) => { console.error('[RolesCodes] fetchRoles failed:', err); setError(`Could not load roles: ${err.message}`); })
      .finally(() => setLoading(false));
  };

  useEffect(loadRoles, []);

  useEffect(() => {
    fetchRetentionStatus().then((res) => setRetention(res.data)).catch((err) => console.error('[RolesCodes] fetchRetentionStatus failed:', err));
  }, []);

  const runRetention = async () => {
    setRetentionRunning(true);
    setRetentionResult(null);
    try {
      const res = await runRetentionNow();
      setRetentionResult({ ok: true, message: res.message });
    } catch (err) {
      setRetentionResult({ ok: false, message: err.message });
    } finally {
      setRetentionRunning(false);
    }
  };

  const addRole = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    if (!form.code || !form.title) return;

    try {
      const res = await createRole(form);
      setRoles((prev) => [res.data, ...prev]);
      setForm(emptyForm);
      const linkedinMsg = res.linkedin && res.linkedin.posted ? 'LinkedIn ✅' : `LinkedIn skipped (${res.linkedin ? res.linkedin.reason : 'n/a'})`;
      const naukriMsg = res.naukri && res.naukri.posted ? 'Naukri ✅' : `Naukri skipped (${res.naukri ? res.naukri.reason : 'n/a'})`;
      setNotice(`✅ Role created and saved to the database. ${linkedinMsg}. ${naukriMsg}.`);
    } catch (err) {
      setError(`Could not create role: ${err.message}`);
    }
  };

  const removeRole = async (code) => {
    setError('');
    try {
      await deleteRole(code);
      setRoles((prev) => prev.filter((r) => r.code !== code));
    } catch (err) {
      setError(`Could not delete role: ${err.message}`);
    }
  };

  // Employment type management
  const openAddEmpTypeModal = () => {
    setEmpTypeForm({ name: '', label: '', prefix: '', isPrefixBased: false, sortOrder: 0, description: '' });
    setEmpTypeError('');
    setShowEmpTypeModal(true);
  };

  const closeEmpTypeModal = () => {
    setShowEmpTypeModal(false);
    setEmpTypeError('');
  };

  const handleEmpTypeSubmit = async (e) => {
    e.preventDefault();
    setEmpTypeError('');
    const { name, label, prefix, isPrefixBased, sortOrder, description } = empTypeForm;

    if (!name || !label) {
      setEmpTypeError('Name and Label are required.');
      return;
    }
    if (isPrefixBased && !prefix) {
      setEmpTypeError('Prefix is required for prefix-based employment types.');
      return;
    }

    setEmpTypeLoading(true);
    try {
      await createEmploymentType({
        name: name.trim(),
        label: label.trim(),
        prefix: isPrefixBased ? prefix.trim().toUpperCase() : null,
        isPrefixBased,
        sortOrder: Number(sortOrder) || 0,
        description: description.trim()
      });
      closeEmpTypeModal();
    } catch (err) {
      setEmpTypeError(err.message || 'Failed to create employment type');
    } finally {
      setEmpTypeLoading(false);
    }
  };

  const handleDeleteEmpType = async (name) => {
    if (!window.confirm(`Delete employment type "${name}"? This cannot be undone and will fail if any roles or candidates still reference it.`)) return;
    try {
      await deleteEmploymentType(name);
    } catch (err) {
      setError(err.message || 'Failed to delete employment type');
    }
  };

  const handleDeactivateEmpType = async (name) => {
    if (!window.confirm(`Deactivate employment type "${name}"? It will no longer be available for new roles/candidates but historical data will keep its value.`)) return;
    try {
      await deactivateEmploymentType(name);
    } catch (err) {
      setError(err.message || 'Failed to deactivate employment type');
    }
  };

  // Get only active employment types for the role creation dropdown
  const activeEmpTypes = employmentTypes.filter((et) => et.isActive).sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <>
      <h1 className="page-title">Roles & Codes</h1>
      <p className="page-sub">Manage job role codes referenced across applications, filters, and Slack routing</p>

      {error && <div className="alert alert-error">⚠️ {error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      <div className="card" style={{ marginBottom: 18 }}>
        <h3 style={{ marginTop: 0, fontSize: 14 }}>Add New Role</h3>
        <p style={{ fontSize: 12, color: 'var(--text-500)', marginTop: -6 }}>
          Publishing also attempts to post this job to LinkedIn and Naukri.com (if credentials are configured in the backend .env).
        </p>
        <form onSubmit={addRole} className="form-grid" style={{ marginBottom: 0 }}>
          <div><input placeholder="Role Code (e.g. BTA-ENG-03)" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
          <div><input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div><input placeholder="Department" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></div>
          <div>
            <select value={form.empType} onChange={(e) => setForm({ ...form, empType: e.target.value })}>
              {activeEmpTypes.map((et) => (
                <option key={et.name} value={et.name}>{et.label || et.name}</option>
              ))}
            </select>
            {isFreelanceRoleCode(form.code) && (
              <p style={{ fontSize: 11, color: 'var(--text-500)', margin: '4px 0 0' }}>
                Codes starting with "F" are Freelance Coding.
              </p>
            )}
            {isMedicalRoleCode(form.code) && (
              <p style={{ fontSize: 11, color: 'var(--text-500)', margin: '4px 0 0' }}>
                Codes starting with "M" are Medical Hiring.
              </p>
            )}
          </div>
          <div><input type="number" min="0" placeholder="Openings" value={form.openings} onChange={(e) => setForm({ ...form, openings: e.target.value })} /></div>
            <div className="full">
              <textarea placeholder="Job Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} />
            </div>
            <div><input placeholder="Required Skills (comma-separated, e.g. React, Node.js)" value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} /></div>
            <div><input type="number" min="0" placeholder="Min Experience (yrs)" value={form.minExperience} onChange={(e) => setForm({ ...form, minExperience: e.target.value })} style={{ width: 110 }} /></div>
            <div><input placeholder="Not negotiable (e.g. min 5 years experience)" value={form.notNegotiable || ''} onChange={(e) => setForm({ ...form, notNegotiable: e.target.value })} /></div>
          <div className="full"><button className="btn-primary" type="submit">+ Add Role</button></div>
        </form>
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto', marginBottom: 18 }}>
        {loading ? (
          <p style={{ padding: 20, color: 'var(--text-500)' }}>Loading roles...</p>
        ) : (
          <table>
            <thead><tr><th>Code</th><th>Title</th><th>Department</th><th>Type</th><th>Skills</th><th>Min Exp</th><th>Not Negotiable</th><th>Openings</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.code}>
                  <td><strong>{r.code}</strong></td>
                  <td>{r.title}</td>
                  <td>{r.department}</td>
                  <td><span className="badge" style={{ background: 'var(--primary)', color: 'white', fontSize: 11 }}>{typeLabel(r.empType)}</span></td>
                  <td>{r.skills ? r.skills.join(', ') : ''}</td>
                  <td>{r.minExperience || 0}</td>
                  <td>{r.notNegotiable || '—'}</td>
                  <td>{r.openings}</td>
                  <td><span className="badge" style={{ background: r.status === 'Open' ? 'var(--green)' : r.status === 'On-Hold' ? 'var(--amber)' : '#6B7280' }}>{r.status}</span></td>
                  <td><button className="btn-secondary" onClick={() => removeRole(r.code)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && roles.length === 0 && <p style={{ padding: 20, color: 'var(--text-500)' }}>No roles yet — add one above.</p>}
      </div>

      {/* Employment Type Management Section */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ marginTop: 0, fontSize: 14 }}>Manage Employment Types</h3>
          <button className="btn-primary" onClick={openAddEmpTypeModal}>+ Add Employment Type</button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-500)', marginBottom: 12 }}>
          Employment types drive candidate filters across all dashboards (Candidate Pool, Skill Search, Statistics, Assessment & Outreach, etc.). 
          Prefix-based types (e.g., F → Freelance Coding, M → Medical Hiring) are auto-assigned when a role code starts with that prefix.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg-100)', textAlign: 'left' }}>
                <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>Name</th>
                <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>Label</th>
                <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>Prefix</th>
                <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>Active</th>
                <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>Default</th>
                <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>Description</th>
                <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {employmentTypes
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((et) => (
                  <tr key={et.name} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 12px' }}><span title={et.name}><strong>{et.label || et.name}</strong></span></td>
                    <td style={{ padding: '8px 12px' }}>{et.label || et.name}</td>
                    <td style={{ padding: '8px 12px' }}>{et.isPrefixBased && et.prefix ? <code>{et.prefix}</code> : <span style={{ color: 'var(--text-500)' }}>—</span>}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span className={`badge`} style={{ background: et.isActive ? 'var(--green)' : '#6B7280', fontSize: 11 }}>
                        {et.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px' }}>{et.isDefault ? '✓' : '—'}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-500)', maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{et.description || '—'}</td>
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                      {!et.isDefault && et.isActive && (
                        <button
                          className="btn-secondary"
                          style={{ marginRight: 6, fontSize: 11, padding: '4px 8px' }}
                          onClick={() => handleDeactivateEmpType(et.name)}
                          title="Deactivate (soft delete)"
                        >
                          Deactivate
                        </button>
                      )}
                      {!et.isDefault && !et.isActive && (
                        <button
                          className="btn-secondary"
                          style={{ marginRight: 6, fontSize: 11, padding: '4px 8px', background: 'var(--red)', color: 'white', border: 'none' }}
                          onClick={() => handleDeleteEmpType(et.name)}
                          title="Delete permanently (only if no references)"
                        >
                          Delete
                        </button>
                      )}
                      {et.isDefault && <span style={{ fontSize: 11, color: 'var(--text-500)' }}>Default (protected)</span>}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0, fontSize: 14 }}>Data Retention</h3>
        {retention ? (
          <p style={{ fontSize: 13, color: 'var(--text-500)' }}>
            Policy: rejected candidates are {retention.mode}d after <strong>{retention.retentionDays} days</strong>.
            Status: <strong>{retention.enabled ? 'Enabled (runs daily at 2 AM)' : 'Disabled'}</strong>.
            {!retention.enabled && ' Set RETENTION_ENABLED=true in backend .env once confirmed with leadership.'}
          </p>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--text-500)' }}>Loading retention policy...</p>
        )}
        {retentionResult && (
          <div className={`alert ${retentionResult.ok ? 'alert-success' : 'alert-error'}`}>{retentionResult.ok ? '✅' : '⚠️'} {retentionResult.message}</div>
        )}
        <button className="btn-secondary" onClick={runRetention} disabled={retentionRunning}>
          {retentionRunning ? 'Running...' : 'Run Cleanup Now'}
        </button>
      </div>

      {/* Add Employment Type Modal */}
      {showEmpTypeModal && (
        <div className="modal-overlay" onClick={closeEmpTypeModal} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ background: 'white', borderRadius: 12, padding: 24, width: '100%', maxWidth: 500, boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <h3 style={{ marginTop: 0, fontSize: 16 }}>Add Employment Type</h3>
            {empTypeError && <div className="alert alert-error" style={{ marginBottom: 12 }}>⚠️ {empTypeError}</div>}
            <form onSubmit={handleEmpTypeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-500)', display: 'block', marginBottom: 4 }}>Name *</label>
                <input
                  type="text"
                  placeholder="e.g. FREELANCE CODING"
                  value={empTypeForm.name}
                  onChange={(e) => setEmpTypeForm({ ...empTypeForm, name: e.target.value })}
                  style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)' }}
                  required
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-500)', display: 'block', marginBottom: 4 }}>Label (display name) *</label>
                <input
                  type="text"
                  placeholder="e.g. Freelance Coding"
                  value={empTypeForm.label}
                  onChange={(e) => setEmpTypeForm({ ...empTypeForm, label: e.target.value })}
                  style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)' }}
                  required
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-500)', display: 'block', marginBottom: 4 }}>
                  <input type="checkbox" checked={empTypeForm.isPrefixBased} onChange={(e) => setEmpTypeForm({ ...empTypeForm, isPrefixBased: e.target.checked })} />
                  Prefix-based (auto-assign by role code prefix)
                </label>
              </div>
              {empTypeForm.isPrefixBased && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-500)', display: 'block', marginBottom: 4 }}>Prefix *</label>
                  <input
                    type="text"
                    placeholder="e.g. F or M"
                    value={empTypeForm.prefix}
                    onChange={(e) => setEmpTypeForm({ ...empTypeForm, prefix: e.target.value })}
                    style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', textTransform: 'uppercase' }}
                    maxLength={2}
                    required
                  />
                </div>
              )}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-500)', display: 'block', marginBottom: 4 }}>Sort Order</label>
                <input
                  type="number"
                  min="0"
                  value={empTypeForm.sortOrder}
                  onChange={(e) => setEmpTypeForm({ ...empTypeForm, sortOrder: Number(e.target.value) || 0 })}
                  style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-500)', display: 'block', marginBottom: 4 }}>Description</label>
                <textarea
                  placeholder="Optional description"
                  value={empTypeForm.description}
                  onChange={(e) => setEmpTypeForm({ ...empTypeForm, description: e.target.value })}
                  rows={3}
                  style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn-secondary" onClick={closeEmpTypeModal} disabled={empTypeLoading}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={empTypeLoading}>{empTypeLoading ? 'Adding...' : 'Add Employment Type'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default RolesCodes;