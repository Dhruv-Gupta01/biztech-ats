import React from 'react';

function PipelineBar({ stages }) {
  const total = stages.reduce((sum, s) => sum + s.count, 0);
  return (
    <div>
      <div className="pipeline-bar">
        {stages.map((s) => (
          <div key={s.label} className="pipeline-seg" style={{ width: total > 0 ? `${(s.count / total) * 100}%` : '0%', background: s.color }} title={`${s.label}: ${s.count}`} />
        ))}
      </div>
    </div>
  );
}

export default PipelineBar;