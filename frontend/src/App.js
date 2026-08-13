import React from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import AuthPage from './components/AuthPage';
import CandidateDashboard from './components/CandidateDashboard';
import RecruiterApp from './components/RecruiterApp';

function Gate() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-500)' }}>
        Loading...
      </div>
    );
  }

  if (!user) return <AuthPage />;
  if (user.role === 'candidate') return <CandidateDashboard />;
  return <RecruiterApp />;
}

function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}

export default App;