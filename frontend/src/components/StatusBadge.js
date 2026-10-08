import React from 'react';

function StatusBadge({ status, label }) {
  const cls = 'badge badge-' + (status || 'applied').toLowerCase();
  return <span className={cls}>{label || status}</span>;
}

export default StatusBadge;