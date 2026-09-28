import React, { useEffect, useState } from 'react';
import { fetchRoles, bulkUploadResumes, bulkImportWithRole } from '../api/api';

function BulkResumeUpload() {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [roleCode, setRoleCode] = useState('');
  const [files, setFiles] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [tab, setTab] = useState('pdf');

  useEffect(() => {
    setLoading(true);
    fetchRoles()
      .then((res) => setRoles(res.data || []))
      .catch((err) => setError(`Could not load roles: ${err.message}`))
      .finally(() => setLoading(false));
  }, []);

  const handleFiles = (rawFiles) => {
    const selected = Array.from(rawFiles || []);
    if (tab === 'pdf') {
      const pdfs = selected.filter((f) => f.type === 'application/pdf');
      setFiles(pdfs);
    } else {
      const csvs = selected.filter((f) => f.name && (f.name.toLowerCase().endsWith('.csv') || f.type === 'text/csv' || f.type === 'application/vnd.ms-excel'));
      setFiles(csvs);
    }
    setError('');
    setResult(null);
  };

  const handleFileChange = (e) => {
    handleFiles(e.target.files);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!roleCode) {
      setError('Please select a role code.');
      return;
    }
    if (!(files || []).length) {
      setError('Please select at least one file.');
      return;
    }

    setUploading(true);
    setError('');
    setResult(null);

    try {
      if (tab === 'pdf') {
        const formData = new FormData();
        formData.append('roleCode', roleCode);
        (files || []).forEach((file) => formData.append('resumes', file));
        const res = await bulkUploadResumes(formData);
        if (res.success) {
          setResult(res);
          setFiles([]);
        } else {
          setError(res.message || 'Upload failed.');
        }
      } else {
        const formData = new FormData();
        formData.append('roleCode', roleCode);
        formData.append('file', (files || [])[0]);
        const res = await bulkImportWithRole(formData);
        if (res.success) {
          setResult(res);
          setFiles([]);
        } else {
          setError(res.message || 'Import failed.');
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <h1 className="page-title">Bulk Resume Upload</h1>
      <p className="page-sub">Upload multiple PDF resumes or a CSV file for a specific role code. Data will be parsed and added to the candidate database.</p>

      {error && <div className="alert alert-error">⚠️ {error}</div>}
      {result && (
        <div className="alert alert-success">
          ✅ {tab === 'pdf' ? 'Upload' : 'Import'} complete! Inserted: {result.insertedCount}, Skipped: {result.skippedCount}
          {(result.errors || []).length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
              {(result.errors || []).slice(0, 10).map((err, i) => (
                <li key={i} style={{ fontSize: 12.5 }}>
                  {err.fileName || `Row ${err.row}`}: {err.reason}
                </li>
              ))}
              {(result.errors || []).length > 10 && <li style={{ fontSize: 12.5 }}>...and {(result.errors || []).length - 10} more.</li>}
            </ul>
          )}
        </div>
      )}

      <div className="card" style={{ maxWidth: 700, margin: '0 auto', padding: 24 }}>
        {loading ? (
          <p style={{ color: 'var(--text-500)' }}>Loading roles...</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-500)', display: 'block', marginBottom: 6 }}>Role Code *</label>
              <select value={roleCode} onChange={(e) => setRoleCode(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)' }}>
                <option value="">Select a role code...</option>
                {(roles || []).map((r) => <option key={r.code} value={r.code}>{r.code} — {r.title}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-500)', display: 'block', marginBottom: 6 }}>Upload Type *</label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button type="button" className={tab === 'pdf' ? 'btn-primary' : 'btn-secondary'} onClick={() => { setTab('pdf'); setFiles([]); setResult(null); setError(''); }}>
                  PDF Resumes
                </button>
                <button type="button" className={tab === 'csv' ? 'btn-primary' : 'btn-secondary'} onClick={() => { setTab('csv'); setFiles([]); setResult(null); setError(''); }}>
                  CSV File
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-500)', display: 'block', marginBottom: 6 }}>
                {tab === 'pdf' ? 'Resume PDFs *' : 'CSV File *'}
              </label>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                style={{
                  border: `2px dashed ${dragActive ? 'var(--primary)' : 'var(--border)'}`,
                  borderRadius: 8,
                  padding: '24px 16px',
                  textAlign: 'center',
                  background: dragActive ? 'rgba(0,0,0,0.02)' : 'transparent',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                <input
                  type="file"
                  accept={tab === 'pdf' ? 'application/pdf' : '.csv,text/csv,application/vnd.ms-excel'}
                  multiple={tab === 'pdf'}
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                  id="bulk-upload-input"
                />
                <label htmlFor="bulk-upload-input" style={{ cursor: 'pointer', display: 'block' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>{tab === 'pdf' ? '📄' : '📊'}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                    {dragActive ? 'Drop files here' : tab === 'pdf' ? 'Click to select or drag & drop PDF resumes' : 'Click to select or drag & drop CSV file'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-500)' }}>
                    {tab === 'pdf' ? 'You can select multiple files at once' : 'Upload one CSV file with candidate data'}
                  </div>
                </label>
              </div>
              {(files || []).length > 0 && (
                <div style={{ marginTop: 10, padding: 10, background: 'rgba(0,0,0,0.02)', borderRadius: 6 }}>
                  <p style={{ fontSize: 12.5, fontWeight: 600, margin: '0 0 6px' }}>{(files || []).length} file(s) selected:</p>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: 'var(--text-500)' }}>
                    {(files || []).map((f, i) => <li key={i}>{f.name}</li>)}
                  </ul>
                </div>
              )}
            </div>

            <button className="btn-primary" type="submit" disabled={uploading || !roleCode || !(files || []).length}>
              {uploading ? 'Processing...' : tab === 'pdf' ? `Upload ${(files || []).length || ''} Resume${(files || []).length === 1 ? '' : 's'}` : 'Import CSV'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default BulkResumeUpload;
