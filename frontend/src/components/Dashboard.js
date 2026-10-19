import React, { useEffect, useState } from 'react';
import MetricCard from './MetricCard';
import PipelineBar from './PipelineBar';
import { fetchDashboardMetrics, fetchRoles } from '../api/api';

function Dashboard() {
  const [metrics, setMetrics] = useState(null);
  const [roles, setRoles] = useState([]);
  const [roleCode, setRoleCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = (scopeRoleCode) => {
    setLoading(true);
    fetchDashboardMetrics(scopeRoleCode)
      .then((res) => { setMetrics(res.data); setError(''); })
      .catch((err) => { console.error('[Dashboard] load failed:', err); setError(`Could not load dashboard: ${err.message}`); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(roleCode); }, [roleCode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchRoles().then((res) => setRoles(res.data)).catch((err) => console.error('[Dashboard] fetchRoles failed:', err));
  }, []);

  return (
    <>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-sub">Hiring pipeline overview — live from the database{roleCode ? `, scoped to ${roleCode}` : ' (all roles)'}</p>

      <div className="filters-row" style={{ marginBottom: 8 }}>
        <select value={roleCode} onChange={(e) => setRoleCode(e.target.value)}>
          <option value="">All roles</option>
          {roles.map((r) => <option key={r.code} value={r.code}>{r.code} — {r.title}</option>)}
        </select>
        <button className="btn-secondary" onClick={() => load(roleCode)}>Refresh</button>
      </div>

      {error && <div className="alert alert-error">⚠️ {error}</div>}

      {loading ? (
        <p style={{ color: 'var(--text-500)' }}>Loading dashboard...</p>
      ) : metrics ? (
        <>
          <div className="grid grid-4">
            <MetricCard label="Total Candidates" value={metrics.total} />
            <MetricCard label="Open Roles" value={metrics.openRoles} />
            <MetricCard label="Avg. Suitability Score" value={metrics.avgSuitability ?? '—'} />
            <MetricCard label="Hired (All Time)" value={metrics.hiredCount} />
          </div>

          <div className="grid grid-2 section-gap">
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Overall Hiring Pipeline</h3>
              {metrics.total > 0
                ? <PipelineBar stages={metrics.overallFunnel} />
                : <p style={{ color: 'var(--text-500)' }}>No candidates yet — pipeline will populate as applications come in.</p>}
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Source Breakdown</h3>
              {metrics.sourceBreakdown.length > 0
                ? <PipelineBar stages={metrics.sourceBreakdown} />
                : <p style={{ color: 'var(--text-500)' }}>No candidates yet.</p>}
            </div>
          </div>

          {!roleCode && (
            <div className="section-gap">
              <h3>Pipeline by Job Role</h3>
              {metrics.perRolePipeline.length === 0 && (
                <p style={{ color: 'var(--text-500)' }}>No applications yet — each role's pipeline appears here once candidates apply to it.</p>
              )}
              <div className="grid grid-2">
                {metrics.perRolePipeline.map((rp) => {
                  const roleTotal = rp.stages.reduce((sum, s) => sum + s.count, 0);
                  return (
                    <div className="card" key={rp.roleCode}>
                      <h4 style={{ marginTop: 0, marginBottom: 10 }}>
                        {rp.roleTitle} <span style={{ color: 'var(--text-500)', fontWeight: 500 }}>({rp.roleCode})</span>
                      </h4>
                      {roleTotal > 0
                        ? <PipelineBar stages={rp.stages} />
                        : <p style={{ color: 'var(--text-500)', fontSize: 13 }}>No applicants yet for this role.</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      ) : null}
    </>
  );
}

export default Dashboard;