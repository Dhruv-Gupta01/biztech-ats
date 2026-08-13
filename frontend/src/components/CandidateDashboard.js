import React from 'react';
import { useAuth } from '../auth/AuthContext';
import CandidateForm from './CandidateForm';

function CandidateDashboard() {
  const { user, logout } = useAuth();

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header className="topbar">
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14 }}>
          Talent Console <span style={{ color: 'var(--text-500)', fontWeight: 500 }}>– BIZ TECH ANALYTICS</span>
        </div>
        <div style={{ flex: 1 }} />
        <div className="topbar-right">
          <span className="sync-pill">Signed in as {user.fullName}</span>
          <button className="btn-secondary" onClick={logout}>Log Out</button>
        </div>
      </header>
      <div className="content" style={{ maxWidth: 900, margin: '0 auto' }}>
        <CandidateForm />
      </div>
    </div>
  );
}

export default CandidateDashboard;