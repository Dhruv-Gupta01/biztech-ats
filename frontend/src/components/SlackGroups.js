import React, { useEffect, useState } from 'react';
import { fetchSlackMappings, createSlackMapping, updateSlackMapping, deleteSlackMapping, fetchRoles } from '../api/api';

function SlackGroups() {
  const [mappings, setMappings] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ roleCode: '', channel: '', webhook: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchSlackMappings(), fetchRoles()])
      .then(([mappingsRes, rolesRes]) => {
        setMappings(mappingsRes.data);
        setRoles(rolesRes.data);
        if (rolesRes.data.length > 0) setForm((f) => ({ ...f, roleCode: rolesRes.data[0].code }));
        setError('');
      })
      .catch((err) => { console.error('[SlackGroups] load failed:', err); setError(`Could not load data: ${err.message}`); })
      .finally(() => setLoading(false));
  }, []);

  const addMapping = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.roleCode || !form.channel || !form.webhook) return;

    try {
      const res = await createSlackMapping(form);
      setMappings((prev) => [res.data, ...prev]);
      setForm((f) => ({ ...f, channel: '', webhook: '' }));
    } catch (err) {
      setError(`Could not create mapping: ${err.message}`);
    }
  };

  const toggleActive = async (m) => {
    setError('');
    try {
      const res = await updateSlackMapping(m._id, { active: !m.active });
      setMappings((prev) => prev.map((x) => (x._id === m._id ? res.data : x)));
    } catch (err) {
      setError(`Could not update mapping: ${err.message}`);
    }
  };

  const removeMapping = async (m) => {
    setError('');
    try {
      await deleteSlackMapping(m._id);
      setMappings((prev) => prev.filter((x) => x._id !== m._id));
    } catch (err) {
      setError(`Could not delete mapping: ${err.message}`);
    }
  };

  return (
    <>
      <h1 className="page-title">Slack Groups</h1>
      <p className="page-sub">Map role codes to Slack channels so new applicants and stage changes post automatically</p>

      {error && <div className="alert alert-error">⚠️ {error}</div>}

      <div className="card" style={{ marginBottom: 18 }}>
        <h3 style={{ marginTop: 0, fontSize: 14 }}>Add Mapping</h3>
        <form onSubmit={addMapping} className="filters-row" style={{ marginBottom: 0 }}>
          <select value={form.roleCode} onChange={(e) => setForm({ ...form, roleCode: e.target.value })}>
            {roles.length === 0 && <option value="">No roles yet</option>}
            {roles.map((r) => <option key={r.code} value={r.code}>{r.code}</option>)}
          </select>
          <input placeholder="#channel-name" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })} style={{ minWidth: 180 }} />
          <input placeholder="Slack Webhook URL" value={form.webhook} onChange={(e) => setForm({ ...form, webhook: e.target.value })} style={{ minWidth: 280 }} />
          <button className="btn-primary" type="submit" disabled={roles.length === 0}>+ Add Mapping</button>
        </form>
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        {loading ? (
          <p style={{ padding: 20, color: 'var(--text-500)' }}>Loading Slack mappings...</p>
        ) : (
          <table>
            <thead><tr><th>Role Code</th><th>Channel</th><th>Webhook</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {mappings.map((m) => (
                <tr key={m._id}>
                  <td><strong>{m.roleCode}</strong></td>
                  <td>{m.channel}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-500)' }}>{m.webhook.slice(0, 42)}...</td>
                  <td>
                    <span className="badge" style={{ background: m.active ? 'var(--green)' : '#6B7280' }}>
                      {m.active ? 'Active' : 'Paused'}
                    </span>
                  </td>
                  <td className="actions-row">
                    <button className="btn-secondary" onClick={() => toggleActive(m)}>{m.active ? 'Pause' : 'Activate'}</button>
                    <button className="btn-secondary" onClick={() => removeMapping(m)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && mappings.length === 0 && <p style={{ padding: 20, color: 'var(--text-500)' }}>No Slack mappings yet — add one above.</p>}
      </div>
    </>
  );
}

export default SlackGroups;