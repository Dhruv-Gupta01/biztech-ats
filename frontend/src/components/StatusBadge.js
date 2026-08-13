import React from 'react';

function StatusBadge({ status }) {
  const cls = 'badge badge-' + (status || 'applied').toLowerCase();
  return <span className={cls}>{status}</span>;
}

export default StatusBadge;