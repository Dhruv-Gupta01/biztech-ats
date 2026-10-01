import React, { useEffect, useState } from 'react';
import { fetchEmailTemplates, createEmailTemplate, updateEmailTemplate, deleteEmailTemplate } from '../api/api';

function TemplateManager({ templates, setTemplates, onTemplateSelect, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', subject: '', body: '', attachments: [] });
  const [editingId, setEditingId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('list');

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
    setActiveTab('edit');
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createEmailTemplate(form);
      setShowCreate(false);
      resetForm();
      setActiveTab('list');
      const updated = await fetchEmailTemplates();
      if (updated.success) {
        setTemplates(updated.data);
        if (onTemplateSelect && updated.data.length > 0) {
          onTemplateSelect(updated.data[0]._id || updated.data[0].id);
        }
      }
    } catch (err) {
      console.error('[TemplateManager] create failed:', err);
      alert('Could not create template: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await updateEmailTemplate(editingId, form);
      setEditingId(null);
      resetForm();
      setActiveTab('list');
      const updated = await fetchEmailTemplates();
      if (updated.success) {
        setTemplates(updated.data);
        if (onTemplateSelect && res.data) {
          onTemplateSelect(res.data._id || res.data.id);
        }
      }
    } catch (err) {
      console.error('[TemplateManager] edit failed:', err);
      alert('Could not update template: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    setSaving(true);
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
      alert('Could not delete template: ' + err.message);
    } finally {
      setSaving(false);
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

  if (loading) return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <p>Loading templates...</p>
      </div>
    </div>
  );
  if (error) return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <p style={{ color: 'var(--text-500)' }}>Error: {error}</p>
        <button className="btn-secondary" onClick={onClose} style={{ marginTop: 10 }}>Close</button>
      </div>
    </div>
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 900, width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <div>
            <h2 style={{ margin: '0 0 4px', fontFamily: 'var(--font-display)', fontSize: 19 }}>Email Template Manager</h2>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-500)' }}>Create, edit, and delete email templates for outreach</p>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {activeTab === 'list' && (
            <>
              <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: 15 }}>Saved Templates</h3>
                <button
                  onClick={() => { resetForm(); setShowCreate(true); setActiveTab('create'); }}
                  style={{ padding: '8px 16px', background: 'var(--bg)', color: 'var(--text-500)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}
                >
                  Add New Template
                </button>
              </div>
              <p style={{ fontSize: 12.5, color: 'var(--text-500)', marginBottom: 12 }}>Manage email templates for outreach. Variables available: {'{{candidateName}}'}, {'{{roleTitle}}'}</p>
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                {templates.map((t) => (
                  <div key={t._id || t.id} style={{ padding: 14, borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 6 }}>{t.name}</div>
                        <div style={{ fontSize: 12.5, color: 'var(--text-500)', marginBottom: 4 }}>
                          <strong>Subject:</strong> {t.subject}
                        </div>
                        <div style={{ fontSize: 12.5, color: 'var(--text-500)', whiteSpace: 'pre-wrap', background: 'var(--bg)', padding: 8, borderRadius: 4, marginBottom: 6 }}>
                          <strong>Body:</strong> {t.body}
                        </div>
                        {t.attachments && t.attachments.length > 0 && (
                          <div style={{ fontSize: 12.5, color: 'var(--text-500)' }}>
                            <strong>Attachments:</strong>
                            <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
                              {t.attachments.map((a, i) => (
                                <li key={i}><a href={a.url} target="_blank" rel="noopener noreferrer">{a.name || a.url}</a></li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginLeft: 12 }}>
                        <button
                          onClick={() => startEdit(t)}
                          style={{ padding: '6px 14px', fontSize: 12, border: '1px solid var(--primary)', color: 'var(--primary)', borderRadius: 4, cursor: 'pointer', background: 'transparent' }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setConfirmDelete(t._id || t.id)}
                          style={{ padding: '6px 14px', fontSize: 12, border: '1px solid var(--red)', color: 'var(--red)', borderRadius: 4, cursor: 'pointer', background: 'transparent' }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {templates.length === 0 && <p style={{ padding: 20, color: 'var(--text-500)', textAlign: 'center' }}>No templates yet. Create one above.</p>}
              </div>
            </>
          )}

          {confirmDelete && (
            <div style={{ marginTop: 16, padding: 16, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 1001, boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
              <p style={{ marginBottom: 12, color: 'var(--text-500)', fontSize: 14 }}>Are you sure you want to delete this template?</p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={() => setConfirmDelete(null)} disabled={saving} style={{ padding: '8px 16px', background: 'var(--bg)', color: 'var(--text-500)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}>Cancel</button>
                <button onClick={() => { handleDelete(confirmDelete); setConfirmDelete(null); }} disabled={saving} style={{ padding: '8px 16px', background: 'var(--red)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Delete</button>
              </div>
            </div>
          )}

          {(showCreate || activeTab === 'create') && (
            <div>
              <h4 style={{ marginTop: 0, marginBottom: 16, fontSize: 15 }}>Create New Blank Template</h4>
               <form onSubmit={handleCreate}>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 13, color: 'var(--text-500)', marginBottom: 6, fontWeight: 600 }}>Template Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={handleChange}
                    name="name"
                    placeholder="e.g., Interview Invitation"
                    required
                    style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid var(--border)', fontSize: 14 }}
                  />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 13, color: 'var(--text-500)', marginBottom: 6, fontWeight: 600 }}>Subject</label>
                  <input
                    type="text"
                    value={form.subject}
                    onChange={handleChange}
                    name="subject"
                    placeholder="e.g., Interview Invitation – {{roleTitle}} at BizTech Analytics"
                    required
                    style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid var(--border)', fontSize: 14 }}
                  />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 13, color: 'var(--text-500)', marginBottom: 6, fontWeight: 600 }}>Body</label>
                  <textarea
                    value={form.body}
                    onChange={handleChange}
                    name="body"
                    placeholder="Hi {{candidateName}},&#10;&#10;Thank you for applying..."
                    rows={8}
                    style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid var(--border)', minHeight: 160, resize: 'vertical', fontSize: 14 }}
                  />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 13, color: 'var(--text-500)', marginBottom: 6, fontWeight: 600 }}>Attachments (optional)</label>
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
                        placeholder="https://..."
                        style={{ flex: 2, padding: 8, borderRadius: 4, border: '1px solid var(--border)' }}
                      />
                      <button type="button" onClick={() => removeAttachment(i)} style={{ padding: '8px 12px', background: 'var(--red)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Remove</button>
                    </div>
                  ))}
                  <button type="button" onClick={addAttachment} style={{ padding: '8px 12px', background: 'var(--bg)', color: 'var(--text-500)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}>
                    + Add Attachment
                  </button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                  <button type="button" onClick={() => { setShowCreate(false); setActiveTab('list'); resetForm(); }} disabled={saving} style={{ padding: '8px 16px', background: 'var(--bg)', color: 'var(--text-500)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}>Cancel</button>
                  <button type="submit" disabled={saving} style={{ padding: '8px 16px', background: 'var(--bg)', color: 'var(--text-500)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}>
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {activeTab === 'edit' && editingId && (
            <div>
              <h4 style={{ marginTop: 0, marginBottom: 16, fontSize: 15 }}>Edit Template</h4>
              <form onSubmit={handleEdit}>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 13, color: 'var(--text-500)', marginBottom: 6, fontWeight: 600 }}>Template Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={handleChange}
                    name="name"
                    required
                    style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid var(--border)', fontSize: 14 }}
                  />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 13, color: 'var(--text-500)', marginBottom: 6, fontWeight: 600 }}>Subject</label>
                  <input
                    type="text"
                    value={form.subject}
                    onChange={handleChange}
                    name="subject"
                    required
                    style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid var(--border)', fontSize: 14 }}
                  />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 13, color: 'var(--text-500)', marginBottom: 6, fontWeight: 600 }}>Body</label>
                  <textarea
                    value={form.body}
                    onChange={handleChange}
                    name="body"
                    rows={8}
                    style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid var(--border)', minHeight: 160, resize: 'vertical', fontSize: 14 }}
                  />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 13, color: 'var(--text-500)', marginBottom: 6, fontWeight: 600 }}>Attachments (optional)</label>
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
                        placeholder="https://..."
                        style={{ flex: 2, padding: 8, borderRadius: 4, border: '1px solid var(--border)' }}
                      />
                      <button type="button" onClick={() => removeAttachment(i)} style={{ padding: '8px 12px', background: 'var(--red)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Remove</button>
                    </div>
                  ))}
                  <button type="button" onClick={addAttachment} style={{ padding: '8px 12px', background: 'var(--bg)', color: 'var(--text-500)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}>
                    + Add Attachment
                  </button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                  <button type="button" onClick={() => { setEditingId(null); setActiveTab('list'); resetForm(); }} disabled={saving} style={{ padding: '8px 16px', background: 'var(--bg)', color: 'var(--text-500)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}>Cancel</button>
                  <button type="submit" disabled={saving} style={{ padding: '8px 16px', background: 'var(--bg)', color: 'var(--text-500)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}>
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default TemplateManager;
