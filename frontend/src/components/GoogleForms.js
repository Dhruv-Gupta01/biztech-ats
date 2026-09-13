import React, { useEffect, useState } from 'react';
import {
  fetchGoogleForms,
  createGoogleForm,
  updateGoogleForm,
  deleteGoogleForm
} from '../api/api';

const EMPTY_FORM = {
  name: '',
  formUrl: '',
  formEmailEntryId: '',
  responseSheetId: '',
  roleCode: '',
  isActive: true
};

function GoogleForms() {
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const loadForms = () => {
    setLoading(true);
    setError('');
    fetchGoogleForms()
      .then((res) => {
        if (res.success) setForms(res.data || []);
      })
      .catch((err) => setError(`Could not load forms: ${err.message}`))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadForms(); }, []);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const payload = {
        name: form.name.trim(),
        formUrl: form.formUrl.trim(),
        formEmailEntryId: form.formEmailEntryId.trim(),
        responseSheetId: form.responseSheetId.trim(),
        roleCode: form.roleCode.trim().toUpperCase(),
        isActive: Boolean(form.isActive)
      };

      if (!payload.name || !payload.formUrl || !payload.formEmailEntryId || !payload.responseSheetId) {
        setError('Name, Form URL, Email Entry ID, and Response Sheet ID are required.');
        setSaving(false);
        return;
      }

      let res;
      if (editingId) {
        res = await updateGoogleForm(editingId, payload);
      } else {
        res = await createGoogleForm(payload);
      }

      if (res.success) {
        setSuccess(editingId ? 'Form updated.' : 'Form created.');
        resetForm();
        loadForms();
      } else {
        setError(res.message || 'Save failed.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (item) => {
    setEditingId(item._id);
    setForm({
      name: item.name || '',
      formUrl: item.formUrl || '',
      formEmailEntryId: item.formEmailEntryId || '',
      responseSheetId: item.responseSheetId || '',
      roleCode: item.roleCode || '',
      isActive: item.isActive !== false
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this Google Form configuration? This does not delete the actual Google Form or its responses.')) return;
    setError('');
    setSuccess('');
    try {
      const res = await deleteGoogleForm(id);
      if (res.success) {
        setSuccess('Form deleted.');
        if (editingId === id) resetForm();
        loadForms();
      } else {
        setError(res.message || 'Delete failed.');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div>
      <h1 className="page-title">Google Forms</h1>
      <p className="page-sub">Manage multiple Google Forms for outreach and response syncing. Each form can be tied to a specific role code.</p>

      {error && <div className="alert alert-error">⚠️ {error}</div>}
      {success && <div className="alert alert-success">✅ {success}</div>}

      <div className="card" style={{ marginBottom: 18 }}>
        <h3 style={{ marginTop: 0, marginBottom: 10 }}>{editingId ? 'Edit Form' : 'Add Form'}</h3>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-500)' }}>Name</label>
              <input value={form.name} onChange={(e) => updateField('name', e.target.value)} placeholder="Assessment Form - Engineering" style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-500)' }}>Role Code (optional)</label>
              <input value={form.roleCode} onChange={(e) => updateField('roleCode', e.target.value)} placeholder="BTA-ENG-01" style={{ width: '100%' }} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: 12, color: 'var(--text-500)' }}>Form URL</label>
              <input value={form.formUrl} onChange={(e) => updateField('formUrl', e.target.value)} placeholder="https://docs.google.com/forms/d/e/.../viewform" style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-500)' }}>Email Entry ID</label>
              <input value={form.formEmailEntryId} onChange={(e) => updateField('formEmailEntryId', e.target.value)} placeholder="1146379652" style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-500)' }}>Response Sheet ID</label>
              <input value={form.responseSheetId} onChange={(e) => updateField('responseSheetId', e.target.value)} placeholder="1xsCkbHa9EOrVnwXF5FaRW7LoygIIW8XOnQezKffyuAo" style={{ width: '100%' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <input id="form-active" type="checkbox" checked={form.isActive} onChange={(e) => updateField('isActive', e.target.checked)} />
              <label htmlFor="form-active" style={{ fontSize: 13 }}>Active</label>
            </div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button className="btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : (editingId ? 'Update Form' : 'Create Form')}</button>
            {editingId && <button className="btn-secondary" type="button" onClick={resetForm}>Cancel</button>}
          </div>
        </form>
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        {loading ? (
          <p style={{ padding: 20, color: 'var(--text-500)' }}>Loading forms...</p>
        ) : forms.length === 0 ? (
          <p style={{ padding: 20, color: 'var(--text-500)' }}>No forms configured yet. Add your first Google Form above.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Role Code</th>
                <th>Form URL</th>
                <th>Email Entry ID</th>
                <th>Response Sheet ID</th>
                <th>Active</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {forms.map((item) => (
                <tr key={item._id}>
                  <td>{item.name}</td>
                  <td>{item.roleCode || '—'}</td>
                  <td style={{ fontSize: 12, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.formUrl}</td>
                  <td>{item.formEmailEntryId}</td>
                  <td style={{ fontSize: 12 }}>{item.responseSheetId}</td>
                  <td>{item.isActive ? 'Yes' : 'No'}</td>
                  <td className="actions-row">
                    <button className="btn-secondary" onClick={() => handleEdit(item)}>Edit</button>
                    <button className="btn-secondary" onClick={() => handleDelete(item._id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default GoogleForms;
