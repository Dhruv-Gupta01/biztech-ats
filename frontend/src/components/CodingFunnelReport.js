import React, { useEffect, useMemo, useState } from 'react';
import { Bar, Line, Pie } from 'react-chartjs-2';
import { Chart, registerables } from 'chart.js';
import { fetchCodingFunnel } from '../api/api';
import usePersistentState from '../utils/usePersistentState';

Chart.register(...registerables);

const pad = (n) => String(n).padStart(2, '0');
// A local calendar day as YYYY-MM-DD (the report is in the recruiter's own days).
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const PRESETS = [
  { label: 'Today', range: () => [new Date(), new Date()] },
  { label: 'Yesterday', range: () => [addDays(new Date(), -1), addDays(new Date(), -1)] },
  { label: 'Last 7 days', range: () => [addDays(new Date(), -6), new Date()] },
  { label: 'Last 30 days', range: () => [addDays(new Date(), -29), new Date()] },
  { label: 'This month', range: () => [new Date(new Date().getFullYear(), new Date().getMonth(), 1), new Date()] }
];
const CALENDAR_ACCOUNTS = ['Kartik Mishra', 'Hiring Team', 'Harnoor Mann', 'Unknown'];
// One colour per funnel stage (cool -> green as the candidate gets further), same family as the General report.
const STAGE_COLORS = [
  'rgba(107, 114, 128, 0.85)', 'rgba(107, 114, 128, 0.85)', 'rgba(139, 92, 246, 0.85)', 'rgba(59, 130, 246, 0.85)', 'rgba(37, 99, 235, 0.85)',
  'rgba(6, 182, 212, 0.85)', 'rgba(6, 182, 212, 0.85)', 'rgba(8, 145, 178, 0.85)', 'rgba(8, 145, 178, 0.85)', 'rgba(245, 158, 11, 0.85)',
  'rgba(245, 158, 11, 0.85)', 'rgba(16, 185, 129, 0.85)', 'rgba(22, 163, 74, 0.85)', 'rgba(22, 163, 74, 0.85)', 'rgba(21, 128, 61, 0.85)'
];
const PIE_COLORS = ['rgba(37, 99, 235, 0.8)', 'rgba(16, 185, 129, 0.8)', 'rgba(245, 158, 11, 0.8)', 'rgba(139, 92, 246, 0.8)', 'rgba(236, 28, 36, 0.8)', 'rgba(107, 114, 128, 0.6)'];
// Stages drawn on the trend line.
const TREND = [
  { key: 'imported', color: 'rgba(107, 114, 128, 1)' },
  { key: 'linkSent', color: 'rgba(16, 185, 129, 1)' },
  { key: 'booked', color: 'rgba(37, 99, 235, 1)' },
  { key: 'interviewPassed', color: 'rgba(245, 158, 11, 1)' },
  { key: 'onboarded', color: 'rgba(22, 163, 74, 1)' }
];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function bucketLabel(key, granularity) {
  if (granularity === 'month') return `${MONTHS[+key.slice(5, 7) - 1]} ${key.slice(0, 4)}`;
  const d = `${+key.slice(8, 10)} ${MONTHS[+key.slice(5, 7) - 1]}`;
  return granularity === 'week' ? `Wk ${d}` : d;
}

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Statistics & Report -> Coding. For the coding candidates: how many reached each pipeline stage, in total and
// by the date they reached it, for a day / date range, split by day, week or month.
function CodingFunnelReport() {
  const [from, setFrom] = usePersistentState('codingStats.from', ymd(addDays(new Date(), -29)));
  const [to, setTo] = usePersistentState('codingStats.to', ymd(new Date()));
  const [granularity, setGranularity] = usePersistentState('codingStats.granularity', 'day');
  const [scoreMin, setScoreMin] = usePersistentState('codingStats.scoreMin', '4');
  const [scoreMax, setScoreMax] = usePersistentState('codingStats.scoreMax', '10');
  const [calendar, setCalendar] = usePersistentState('codingStats.calendar', '');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showDaily, setShowDaily] = useState(false); // the date-wise table is hidden until asked for

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchCodingFunnel({ from, to, granularity, scoreMin, scoreMax, calendarAccount: calendar, tzOffset: new Date().getTimezoneOffset() })
      .then((res) => { if (!cancelled) { setData(res.data); setError(''); } })
      .catch((err) => { if (!cancelled) { setError(err.message); setData(null); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [from, to, granularity, scoreMin, scoreMax, calendar]);

  const undatedTotal = useMemo(() => (data ? data.stages.reduce((n, s) => n + s.undated, 0) : 0), [data]);

  const stageByKey = useMemo(() => (data ? Object.fromEntries(data.stages.map((st) => [st.key, st])) : {}), [data]);
  const horizontal = { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } };

  const funnelAll = useMemo(() => (data ? {
    labels: data.stages.map((st) => st.label),
    datasets: [{ label: 'Reached (all time)', data: data.stages.map((st) => st.total), backgroundColor: STAGE_COLORS, borderWidth: 0 }]
  } : null), [data]);
  const funnelPeriod = useMemo(() => (data ? {
    labels: data.stages.map((st) => st.label),
    datasets: [{ label: 'Reached in this period', data: data.stages.map((st) => st.inPeriod), backgroundColor: STAGE_COLORS, borderWidth: 0 }]
  } : null), [data]);
  const trend = useMemo(() => (data ? {
    labels: data.period.buckets.map((b) => bucketLabel(b, data.period.granularity)),
    datasets: TREND.map((t) => ({ label: stageByKey[t.key].label, data: stageByKey[t.key].series, borderColor: t.color, backgroundColor: t.color.replace(', 1)', ', 0.2)'), tension: 0.3 }))
  } : null), [data, stageByKey]);
  const pieOf = (rows) => ({ labels: rows.map((r) => `${r.label} (${r.total})`), datasets: [{ data: rows.map((r) => r.total), backgroundColor: PIE_COLORS, borderWidth: 0 }] });
  const barOf = (rows, color) => ({ labels: rows.map((r) => r.label), datasets: [{ label: 'Candidates', data: rows.map((r) => r.total), backgroundColor: color, borderWidth: 0 }] });
  const empty = (msg) => <p style={{ color: 'var(--text-500)', fontSize: 13 }}>{msg}</p>;

  const exportCSV = () => {
    if (!data) return;
    const labels = data.period.buckets.map((b) => bucketLabel(b, data.period.granularity));
    const rows = [['Stage', 'Reached (all time)', 'Reached in period', 'Reached, no date recorded', ...labels]];
    data.stages.forEach((s) => rows.push([s.label, s.total, s.inPeriod, s.undated, ...s.series]));
    const blob = new Blob([rows.map((r) => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `coding-funnel_${data.period.from}_to_${data.period.to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="filters-row" style={{ alignItems: 'center' }}>
          {PRESETS.map((p) => (
            <button key={p.label} className="btn-secondary" onClick={() => { const [a, b] = p.range(); setFrom(ymd(a)); setTo(ymd(b)); }}>{p.label}</button>
          ))}
          <label style={{ fontSize: 12, color: 'var(--text-500)' }}>From{' '}
            <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label style={{ fontSize: 12, color: 'var(--text-500)' }}>To{' '}
            <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </label>
          <select value={granularity} onChange={(e) => setGranularity(e.target.value)} aria-label="Split by">
            <option value="day">Split by day</option>
            <option value="week">Split by week</option>
            <option value="month">Split by month</option>
          </select>
          <label style={{ fontSize: 12, color: 'var(--text-500)' }} title="Range for the 'Resume score in range' stage">Resume score{' '}
            <input type="number" min="0" max="10" step="0.1" value={scoreMin} onChange={(e) => setScoreMin(e.target.value)} style={{ width: 64 }} aria-label="Score from" />
            {' '}to{' '}
            <input type="number" min="0" max="10" step="0.1" value={scoreMax} onChange={(e) => setScoreMax(e.target.value)} style={{ width: 64 }} aria-label="Score to" />
          </label>
          <select value={calendar} onChange={(e) => setCalendar(e.target.value)} aria-label="Calendly account" title="Only candidates who booked on this Calendly account">
            <option value="">All calendars</option>
            {CALENDAR_ACCOUNTS.map((a) => <option key={a} value={a}>{a === 'Unknown' ? 'Calendar not recorded' : a}</option>)}
          </select>
          <button className="btn-primary" onClick={exportCSV} disabled={!data}>⬇ Export CSV</button>
        </div>
      </div>

      {error && <div className="alert alert-error">⚠️ {error}</div>}
      {loading && !data && <div className="loading">Loading the coding funnel...</div>}

      {data && (
        <>
          <div className="stats-grid">
            <div className="stat-card"><div className="stat-value">{data.scope.candidates.toLocaleString()}</div><div className="stat-label">Coding Candidates</div></div>
            <div className="stat-card"><div className="stat-value">{stageByKey.imported.inPeriod.toLocaleString()}</div><div className="stat-label">Imported in Period</div></div>
            <div className="stat-card"><div className="stat-value">{stageByKey.linkSent.inPeriod.toLocaleString()}</div><div className="stat-label">Links Sent in Period</div></div>
            <div className="stat-card"><div className="stat-value">{stageByKey.booked.inPeriod.toLocaleString()}</div><div className="stat-label">Booked in Period</div></div>
            <div className="stat-card"><div className="stat-value">{stageByKey.interviewPassed.inPeriod.toLocaleString()}</div><div className="stat-label">Interview Passed in Period</div></div>
            <div className="stat-card"><div className="stat-value">{stageByKey.onboarded.inPeriod.toLocaleString()}</div><div className="stat-label">Onboarded in Period</div></div>
          </div>

          {undatedTotal > 0 && (
            <div className="alert" style={{ marginBottom: 16, fontSize: 13 }}>
              ℹ️ Stage dates are recorded from the day this report went live. People who reached a stage earlier are in <strong>Reached (all time)</strong> but
              have no date, so they cannot appear in a period. Imports, resume analysis and (partly) Calendly links are dated from existing data.
            </div>
          )}

          <div className="charts-grid">
            <div className="chart-card">
              <h3>Pipeline Funnel (all time)</h3>
              <div style={{ height: 440 }}><Bar data={funnelAll} options={horizontal} /></div>
            </div>
            <div className="chart-card">
              <h3>Reached in Selected Period ({data.period.from} to {data.period.to})</h3>
              <div style={{ height: 440 }}><Bar data={funnelPeriod} options={horizontal} /></div>
            </div>
          </div>

          <div className="charts-grid">
            <div className="chart-card">
              <h3>Progress Over Time (by {data.period.granularity})</h3>
              <Line data={trend} options={{ responsive: true, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }} />
            </div>
            <div className="chart-card">
              <h3>Booked, by Calendar</h3>
              {data.breakdowns.bookedByCalendar.length
                ? <Pie data={pieOf(data.breakdowns.bookedByCalendar)} options={{ responsive: true, plugins: { legend: { position: 'right' } } }} />
                : empty('No bookings yet.')}
            </div>
          </div>

          <div className="charts-grid">
            <div className="chart-card">
              <h3>Bootcamp Passed, by Attempt</h3>
              {data.breakdowns.bootcampPassedByAttempt.length
                ? <Bar data={barOf(data.breakdowns.bootcampPassedByAttempt, 'rgba(22, 163, 74, 0.8)')} options={{ responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }} />
                : empty('No one has passed the bootcamp yet.')}
            </div>
            <div className="chart-card">
              <h3>Onboarded, by Project</h3>
              {data.breakdowns.onboardedByProject.length
                ? <Bar data={barOf(data.breakdowns.onboardedByProject, 'rgba(8, 145, 178, 0.8)')} options={{ responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }} />
                : empty('Needs Onboarding = Done and a project.')}
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16, overflowX: 'auto' }}>
            <div className="filters-row" style={{ alignItems: 'center', marginBottom: showDaily ? 12 : 0 }}>
              <h2 style={{ margin: 0 }}>Date-wise Breakdown</h2>
              <span style={{ fontSize: 13, color: 'var(--text-500)' }}>Every stage, one column per {data.period.granularity}</span>
              <span style={{ flex: 1 }} />
              <button className="btn-secondary" onClick={() => setShowDaily(!showDaily)}>{showDaily ? 'Hide' : 'Show'} date-wise breakdown</button>
            </div>
            {showDaily && <table>
              <thead>
                <tr>
                  <th>Stage</th>
                  <th title="Everyone who has reached this stage, whenever">Reached (all time)</th>
                  <th title="Reached this stage on a day inside the selected range">In period</th>
                  <th title="Reached it before dates were recorded, so they cannot be placed in a period">No date recorded</th>
                  {data.period.buckets.map((b) => <th key={b}>{bucketLabel(b, data.period.granularity)}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.stages.map((st) => (
                  <tr key={st.key}>
                    <td><strong>{st.label}</strong></td>
                    <td>{st.total.toLocaleString()}</td>
                    <td>{st.inPeriod.toLocaleString()}</td>
                    <td style={{ color: 'var(--text-500)' }}>{st.undated ? st.undated.toLocaleString() : '—'}</td>
                    {st.series.map((n, i) => <td key={i} style={n ? undefined : { color: 'var(--text-500)' }}>{n || '·'}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>}
          </div>
        </>
      )}
    </>
  );
}

export default CodingFunnelReport;
