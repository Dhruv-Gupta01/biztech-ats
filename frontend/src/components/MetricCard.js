import React from 'react';

function MetricCard({ label, value, delta, down }) {
  return (
    <div className="card metric-card">
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
      {delta && <span className={'metric-delta' + (down ? ' down' : '')}>{delta}</span>}
    </div>
  );
}

export default MetricCard;