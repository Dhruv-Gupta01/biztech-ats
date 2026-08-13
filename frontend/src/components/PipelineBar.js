import React from 'react';

function PipelineBar({ stages }) {
  const total = stages.reduce((sum, s) => sum + s.count, 0);
  return (
    <div>
      <div className="pipeline-bar">
        {stages.map((s) => (
          <div key={s.label} className="pipeline-seg" style={{ width: `${(s.count / total) * 100}%`, background: s.color }} title={`${s.label}: ${s.count}`}>
            {s.count}
          </div>
        ))}
      </div>
      <div className="pipeline-legend">
        {stages.map((s) => (
          <span key={s.label}><span className="swatch" style={{ background: s.color }} />{s.label} ({s.count})</span>
        ))}
      </div>
    </div>
  );
}

export default PipelineBar;