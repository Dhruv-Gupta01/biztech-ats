import React from 'react';

const links = [
  { id: 'dashboard', label: 'Dashboard', icon: '◆' },
  { id: 'pool', label: 'Candidate Pool', icon: '☰' },
  { id: 'skills', label: 'Skill Search', icon: '⚲' },
  { id: 'outreach', label: 'Assessment & Outreach', icon: '✉' },
  { id: 'apply', label: 'Application Form', icon: '＋' },
  { id: 'import', label: 'Import Review', icon: '⇩' },
  { id: 'roles', label: 'Roles & Codes', icon: '▤' },
  { id: 'slack', label: 'Slack Groups', icon: '#' },
  { id: 'forms', label: 'Google Forms', icon: '📋' },
  { id: 'roleCodeData', label: 'Role Code Data', icon: '📊' },
  { id: 'bulkUpload', label: 'Bulk Resume Upload', icon: '📤' }
];

function Sidebar({ view, setView }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        Talent Console
        <span>BIZ TECH ANALYTICS</span>
      </div>
      <nav className="sidebar-nav">
        {links.map((l) => (
          <button
            key={l.id}
            className={'sidebar-link' + (view === l.id ? ' active' : '')}
            onClick={() => setView(l.id)}
          >
            <span className="sidebar-icon">{l.icon}</span>
            {l.label}
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">v2.0 · Single dashboard build</div>
    </aside>
  );
}

export default Sidebar;