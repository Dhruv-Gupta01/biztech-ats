import React from 'react';
import { useAuth } from '../auth/AuthContext';

function Header({ setView }) {
  const { user, logout } = useAuth();

  return (
    <header className="topbar">
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14 }}>
        Talent Console <span style={{ color: 'var(--text-500)', fontWeight: 500 }}>– BIZ TECH ANALYTICS</span>
      </div>
      <div className="topbar-search">
        <span className="icon">⚲</span>
        <input placeholder="Search candidates, roles, skills..." />
      </div>
      <div className="topbar-right">
        <span className="sync-pill"><span className="status-dot" /> {user ? user.fullName : 'Live'}</span>
        <button className="btn-primary" onClick={() => setView('apply')}>+ Add Candidate</button>
        <button className="btn-secondary" onClick={logout}>Log Out</button>
      </div>
    </header>
  );
}

export default Header;