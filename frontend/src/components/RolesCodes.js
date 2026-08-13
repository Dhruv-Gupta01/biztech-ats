import React, { useEffect, useState } from 'react';
import { fetchRoles, createRole, deleteRole, fetchRetentionStatus, runRetentionNow } from '../api/api';

const emptyForm = { code: '', title: '', department: '', description: '', empType: 'Full-Time', openings: 1 };

function RolesCodes() {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [retention, setRetention] = useState(null);
  const [retentionRunning, setRetentionRunning] = useState(false);
  const [retentionResult, setRetentionResult] = useState(null);

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

  return (
    <>
      <h1 className="page-title">Roles &amp; Codes</h1>
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
              <option>Full-Time</option><option>Part-Time</option><option>Contract</option><option>Internship</option>
            </select>
          </div>
          <div><input type="number" min="0" placeholder="Openings" value={form.openings} onChange={(e) => setForm({ ...form, openings: e.target.value })} /></div>
          <div className="full">
            <textarea placeholder="Description — used for the internal listing and posted as-is to LinkedIn/Naukri" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} />
          </div>
          <div className="full"><button className="btn-primary" type="submit">+ Add Role</button></div>
        </form>
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto', marginBottom: 18 }}>
        {loading ? (
          <p style={{ padding: 20, color: 'var(--text-500)' }}>Loading roles...</p>
        ) : (
          <table>
            <thead><tr><th>Code</th><th>Title</th><th>Department</th><th>Type</th><th>Openings</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.code}>
                  <td><strong>{r.code}</strong></td>
                  <td>{r.title}</td>
                  <td>{r.department}</td>
                  <td>{r.empType}</td>
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
    </>
  );
}

export default RolesCodes;