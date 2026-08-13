import React, { useEffect, useState } from 'react';
import {
  fetchEtlStatus, runEtlNow, fetchImportReviews, approveImportReview, dismissImportReview
} from '../api/api';

const EDITABLE_FIELDS = ['fullName', 'email', 'phone', 'roleCode', 'yearsOfExperience'];

function formatTimestamp(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

// Recruiter-facing view onto the daily Naukri Drive CSV ETL: shows when the
// job last ran (cron or manual) and lets a recruiter fix/approve or dismiss
// any row the pipeline couldn't insert automatically (missing fields, bad
// email, an unrecognized role code, or a duplicate email already in the pool).
function ImportReview() {
  const [status, setStatus] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [edits, setEdits] = useState({}); // { [reviewId]: { fullName, email, ... } }
  const [rowErrors, setRowErrors] = useState({}); // { [reviewId]: [reasons] }
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadAll = () => {
    setLoading(true);
    return Promise.all([fetchEtlStatus(), fetchImportReviews('pending')])
      .then(([statusRes, reviewsRes]) => {
        setStatus(statusRes.data);
        setReviews(reviewsRes.data);
        const nextEdits = {};
        reviewsRes.data.forEach((r) => {
          nextEdits[r._id] = EDITABLE_FIELDS.reduce((acc, f) => {
            acc[f] = r.rawData?.[f] ?? '';
            return acc;
          }, {});
        });
        setEdits(nextEdits);
        setError('');
      })
      .catch((err) => { console.error('[ImportReview] load failed:', err); setError(`Could not load import review data: ${err.message}`); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadAll(); }, []);

  const handleRunNow = async () => {
    setRunning(true);
    setError('');
    setNotice('');
    try {
      const res = await runEtlNow();
      setNotice(res.message);
      await loadAll();
    } catch (err) {
      setError(`Import run failed: ${err.message}`);
    } finally {
      setRunning(false);
    }
  };

  const updateField = (id, field, value) => {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const approve = async (review) => {
    setBusyId(review._id);
    setError('');
    setRowErrors((prev) => ({ ...prev, [review._id]: undefined }));
    try {
      const res = await approveImportReview(review._id, edits[review._id], 'Recruiter');
      setNotice(res.message);
      setReviews((prev) => prev.filter((r) => r._id !== review._id));
      setStatus((prev) => (prev ? { ...prev, pendingReviewCount: Math.max(0, prev.pendingReviewCount - 1) } : prev));
    } catch (err) {
      setRowErrors((prev) => ({ ...prev, [review._id]: err.data?.reasons || [err.message] }));
    } finally {
      setBusyId(null);
    }
  };

  const dismiss = async (review) => {
    if (!window.confirm(`Dismiss this row from ${review.sourceFile || 'the import'}? This cannot be undone.`)) return;
    setBusyId(review._id);
    setError('');
    try {
      await dismissImportReview(review._id, 'Recruiter');
      setReviews((prev) => prev.filter((r) => r._id !== review._id));
      setStatus((prev) => (prev ? { ...prev, pendingReviewCount: Math.max(0, prev.pendingReviewCount - 1) } : prev));
    } catch (err) {
      setError(`Could not dismiss row: ${err.message}`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <h1 className="page-title">Import Review</h1>
      <p className="page-sub">Daily Naukri CSV import from Google Drive — clean rows go straight into the candidate pool; anything flagged shows up here for a quick fix and approval.</p>

      {error && <div className="alert alert-error">⚠️ {error}</div>}
      {notice && <div className="alert alert-success">✅ {notice}</div>}

      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h3 style={{ marginTop: 0, marginBottom: 6, fontSize: 14 }}>Pipeline Status</h3>
            {status ? (
              <div style={{ fontSize: 13, color: 'var(--text-500)', lineHeight: 1.8 }}>
                <div>Schedule: <strong style={{ color: 'var(--text-900)' }}>{status.schedule}</strong></div>
                <div>
                  ETL enabled: <span className="badge" style={{ background: status.enabled ? 'var(--green)' : '#6B7280' }}>{status.enabled ? 'On' : 'Off'}</span>
                  {'  '}
                  Drive configured: <span className="badge" style={{ background: status.driveConfigured ? 'var(--green)' : 'var(--red)' }}>{status.driveConfigured ? 'Yes' : 'No'}</span>
                </div>
                {!status.driveConfigured && <div style={{ color: 'var(--red)' }}>{status.driveConfigReason}</div>}
                {status.lastRun ? (
                  <div>
                    Last run: <strong style={{ color: 'var(--text-900)' }}>{formatTimestamp(status.lastRun.startedAt)}</strong>
                    {' '}({status.lastRun.triggeredBy}) —{' '}
                    <span className="badge" style={{
                      background: status.lastRun.status === 'success' ? 'var(--green)' : status.lastRun.status === 'failed' ? 'var(--red)' : '#6B7280'
                    }}>{status.lastRun.status}</span>
                    {status.lastRun.message ? <div>{status.lastRun.message}</div> : null}
                  </div>
                ) : (
                  <div>Last run: never</div>
                )}
                <div>Pending review rows: <strong style={{ color: 'var(--text-900)' }}>{status.pendingReviewCount}</strong></div>
              </div>
            ) : (
              <p style={{ color: 'var(--text-500)' }}>Loading status...</p>
            )}
          </div>
          <button className="btn-primary" onClick={handleRunNow} disabled={running}>
            {running ? 'Running...' : '↻ Run Import Now'}
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        {loading ? (
          <p style={{ padding: 20, color: 'var(--text-500)' }}>Loading review rows...</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>Reasons</th>
                <th>Full Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Role Code</th>
                <th>Yrs Exp</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {reviews.map((r) => (
                <tr key={r._id}>
                  <td style={{ fontSize: 12, color: 'var(--text-500)' }}>{r.sourceFile}{r.sourceRow ? ` (row ${r.sourceRow})` : ''}</td>
                  <td>
                    {r.reasons.map((reason, i) => (
                      <span key={i} className="tag">{reason}</span>
                    ))}
                    {rowErrors[r._id] && rowErrors[r._id].map((reason, i) => (
                      <span key={`err-${i}`} className="tag" style={{ background: '#FEE2E2', color: '#991B1B' }}>{reason}</span>
                    ))}
                  </td>
                  <td><input value={edits[r._id]?.fullName || ''} onChange={(e) => updateField(r._id, 'fullName', e.target.value)} style={{ minWidth: 130 }} /></td>
                  <td><input value={edits[r._id]?.email || ''} onChange={(e) => updateField(r._id, 'email', e.target.value)} style={{ minWidth: 170 }} /></td>
                  <td><input value={edits[r._id]?.phone || ''} onChange={(e) => updateField(r._id, 'phone', e.target.value)} style={{ minWidth: 110 }} /></td>
                  <td><input value={edits[r._id]?.roleCode || ''} onChange={(e) => updateField(r._id, 'roleCode', e.target.value)} style={{ minWidth: 100 }} /></td>
                  <td><input value={edits[r._id]?.yearsOfExperience || ''} onChange={(e) => updateField(r._id, 'yearsOfExperience', e.target.value)} style={{ minWidth: 60 }} /></td>
                  <td className="actions-row">
                    <button className="btn-primary" onClick={() => approve(r)} disabled={busyId === r._id}>Approve</button>
                    <button className="btn-secondary" onClick={() => dismiss(r)} disabled={busyId === r._id}>Dismiss</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && reviews.length === 0 && (
          <p style={{ padding: 20, color: 'var(--text-500)' }}>Nothing to review right now — every row from the last import either went straight into the pool or hasn't run yet.</p>
        )}
      </div>
    </>
  );
}

export default ImportReview;
