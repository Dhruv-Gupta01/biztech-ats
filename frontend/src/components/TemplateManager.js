import React, { useEffect, useState } from 'react';
import { fetchEmailTemplates, createEmailTemplate, updateEmailTemplate, deleteEmailTemplate } from '../api/api';

function TemplateManager({ templates, setTemplates, onTemplateSelect, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', subject: '', body: '', attachments: [] });
  const [editingId, setEditingId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    fetchEmailTemplates()
      .then((res) => {
        if (res.success) setTemplates(res.data);
        else setError(res.message || 'Failed to fetch templates');
      })
      .catch((err) => {
        console.error('[TemplateManager] fetch failed:', err);
        setError('Could not load templates');
      })
      .finally(() => setLoading(false));
  }, [setTemplates]);

  const resetForm = () => setForm({ name: '', subject: '', body: '', attachments: [] });

  const startEdit = (t) => {
    setEditingId(t._id || t.id);
    setForm({
      name: t.name,
      subject: t.subject,
      body: t.body,
      attachments: Array.isArray(t.attachments) ? t.attachments.map((a) => ({ ...a })) : []
    });
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const res = await createEmailTemplate(form);
      setShowCreate(false);
      resetForm();
      const updated = await fetchEmailTemplates();
      if (updated.success) {
        setTemplates(updated.data);
        if (onTemplateSelect && updated.data.length > 0) {
          onTemplateSelect(updated.data[0]._id || updated.data[0].id);
        }
      }
    } catch (err) {
      console.error('[TemplateManager] create failed:', err);
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    try {
      const res = await updateEmailTemplate(editingId, form);
      setEditingId(null);
      resetForm();
      const updated = await fetchEmailTemplates();
      if (updated.success) {
        setTemplates(updated.data);
        if (onTemplateSelect && res.data) {
          onTemplateSelect(res.data._id || res.data.id);
        }
      }
    } catch (err) {
      console.error('[TemplateManager] edit failed:', err);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteEmailTemplate(id);
      const updated = await fetchEmailTemplates();
      if (updated.success) {
        setTemplates(updated.data);
        if (onTemplateSelect && updated.data.length > 0) {
          onTemplateSelect(updated.data[0]._id || updated.data[0].id);
        }
      }
      setConfirmDelete(null);
    } catch (err) {
      console.error('[TemplateManager] delete failed:', err);
      setConfirmDelete(null);
    }
  };

  const addAttachment = () => {
    setForm((prev) => ({
      ...prev,
      attachments: [...prev.attachments, { name: '', url: '' }]
    }));
  };

  const updateAttachment = (index, field, value) => {
    setForm((prev) => ({
      ...prev,
      attachments: prev.attachments.map((a, i) => (i === index ? { ...a, [field]: value } : a))
    }));
  };

  const removeAttachment = (index) => {
    setForm((prev) => ({
      ...prev,
      attachments: prev.attachments.filter((_, i) => i !== index)
    }));
  };

  if (loading) return <p>Loading templates...</p>;
  if (error) return <p style={{ color: 'var(--text-500)' }}>Error: {error}</p>;

  return (
    <div className="template-manager">
      {showCreate ? (
        <div style={{ marginBottom: 20 }}>
          <h4>Create New Template</h4>
          <form onSubmit={handleCreate}>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--text-500)', marginBottom: 5 }}>Name</label>
              <input
                type="text"
                value={form.name}
                onChange={handleChange}
                name="name"
                placeholder="e.g., Interview Invitation"
                required
                style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--border)' }}
              />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--text-500)', marginBottom: 5 }}>Subject</label>
              <input
                type="text"
                value={form.subject}
                onChange={handleChange}
                name="subject"
                placeholder="e.g., Interview Invitation – {{roleTitle}} at BizTech Analytics"
                required
                style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--border)' }}
              />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--text-500)', marginBottom: 5 }}>Body</label>
              <textarea
                value={form.body}
                onChange={handleChange}
                name="body"
                placeholder="Hi {{candidateName}},&#10;&#10;Thank you for applying..."
                rows={5}
                style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--border)', minHeight: 120, resize: 'vertical' }}
              />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--text-500)', marginBottom: 5 }}>Attachments (optional)</label>
              {form.attachments.map((a, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input
                    type="text"
                    value={a.name}
                    onChange={(e) => updateAttachment(i, 'name', e.target.value)}
                    placeholder="File name"
                    style={{ flex: 1, padding: 8, borderRadius: 4, border: '1px solid var(--border)' }}
                  />
                  <input
                    type="url"
                    value={a.url}
                    onChange={(e) => updateAttachment(i, 'url', e.target.value)}
                    placeholder="https://drive.google.com/..."
                    style={{ flex: 2, padding: 8, borderRadius: 4, border: '1px solid var(--border)' }}
                  />
                  <button type="button" onClick={() => removeAttachment(i)} style={{ padding: '8px 12px', background: 'var(--red)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Remove</button>
                </div>
              ))}
              <button type="button" onClick={addAttachment} style={{ padding: '8px 12px', background: 'var(--bg)', color: 'var(--text-500)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}>
                + Add Attachment
              </button>
            </div>
            <div style={{ marginTop: 10 }}>
              <button type="submit" style={{ padding: '8px 16px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                Create Template
              </button>
              <button type="button" onClick={() => { setShowCreate(false); resetForm(); }} style={{ marginLeft: 8, padding: '8px 16px', background: 'var(--bg)', color: 'var(--text-500)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}>Cancel</button>
            </div>
          </form>
        </div>
      ) : null}

      {editingId && (
        <div style={{ marginBottom: 20, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
          <h4>Edit Template</h4>
          <form onSubmit={handleEdit}>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--text-500)', marginBottom: 5 }}>Name</label>
              <input
                type="text"
                value={form.name}
                onChange={handleChange}
                name="name"
                required
                style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--border)' }}
              />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--text-500)', marginBottom: 5 }}>Subject</label>
              <input
                type="text"
                value={form.subject}
                onChange={handleChange}
                name="subject"
                required
                style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--border)' }}
              />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--text-500)', marginBottom: 5 }}>Body</label>
              <textarea
                value={form.body}
                onChange={handleChange}
                name="body"
                rows={5}
                style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--border)', minHeight: 120, resize: 'vertical' }}
              />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--text-500)', marginBottom: 5 }}>Attachments (optional)</label>
              {form.attachments.map((a, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input
                    type="text"
                    value={a.name}
                    onChange={(e) => updateAttachment(i, 'name', e.target.value)}
                    placeholder="File name"
                    style={{ flex: 1, padding: 8, borderRadius: 4, border: '1px solid var(--border)' }}
                  />
                  <input
                    type="url"
                    value={a.url}
                    onChange={(e) => updateAttachment(i, 'url', e.target.value)}
                    placeholder="https://drive.google.com/..."
                    style={{ flex: 2, padding: 8, borderRadius: 4, border: '1px solid var(--border)' }}
                  />
                  <button type="button" onClick={() => removeAttachment(i)} style={{ padding: '8px 12px', background: 'var(--red)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Remove</button>
                </div>
              ))}
              <button type="button" onClick={addAttachment} style={{ padding: '8px 12px', background: 'var(--bg)', color: 'var(--text-500)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}>
                + Add Attachment
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
              <button type="submit" style={{ padding: '8px 16px', background: 'var(--primary)', color: 'var(--text-500)', border: '1px solid var(--border)', borderRadius: 4, marginRight: 8, cursor: 'pointer' }}>Save</button>
              <button type="button" onClick={() => { setEditingId(null); resetForm(); }} style={{ padding: '8px 16px', background: 'var(--bg)', color: 'var(--text-500)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ marginTop: 0, fontSize: 14 }}>Email Templates</h3>
          {!showCreate && !editingId && (
            <button onClick={() => setShowCreate(true)} style={{ padding: '6px 12px', fontSize: 12, background: 'var(--primary)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
              + New Template
            </button>
          )}
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--text-500)', marginBottom: 10 }}>Manage email templates for outreach. Variables available: {'{{candidateName}}'}, {'{{roleTitle}}'}, {'{{roleCode}}'}, {'{{formLink}}'}</p>
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          {templates.map((t) => (
            <div key={t._id || t.id} style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>{t.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-500)', marginTop: 4 }}>
                <strong>Subject:</strong> {t.subject}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-500)', marginTop: 4, whiteSpace: 'pre-wrap' }}>
                <strong>Body:</strong> {t.body}
              </div>
              {t.attachments && t.attachments.length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-500)', marginTop: 4 }}>
                  <strong>Attachments:</strong>
                  <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
                    {t.attachments.map((a, i) => (
                      <li key={i}><a href={a.url} target="_blank" rel="noopener noreferrer">{a.name || a.url}</a></li>
                    ))}
                  </ul>
                </div>
              )}
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <button
                  onClick={() => startEdit(t)}
                  style={{
                    padding: '6px 12px', fontSize: 12, border: '1px solid var(--primary)', color: 'var(--primary)', borderRadius: 4, cursor: 'pointer', background: 'transparent'
                  }}
                >
                  Edit
                </button>
                <button
                  onClick={() => setConfirmDelete(t._id || t.id)}
                  style={{
                    padding: '6px 12px', fontSize: 12, border: '1px solid var(--red)', color: 'var(--red)', borderRadius: 4, cursor: 'pointer', background: 'transparent'
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
          {templates.length === 0 && <p style={{ padding: 16, color: 'var(--text-500)' }}>No templates yet. Create one above.</p>}
        </div>

        {confirmDelete && (
          <div style={{ marginTop: 10, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
            <p style={{ marginBottom: 10, color: 'var(--text-500)' }}>Are you sure you want to delete this template?</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDelete(null)} style={{ padding: '6px 12px', background: 'var(--bg)', color: 'var(--text-500)', border: '1px solid var(--border)', borderRadius: 4, marginRight: 8, cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => { handleDelete(confirmDelete); setConfirmDelete(null); }} style={{ padding: '6px 12px', background: 'var(--red)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Delete</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default TemplateManager;
