import React, { useState } from 'react';
import { useAuth } from '../auth/AuthContext';

function AuthPage() {
  const { signup, login } = useAuth();
  const [tab, setTab] = useState('signup'); // 'signup' | 'login'
  const [form, setForm] = useState({ fullName: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const switchTab = (t) => { setTab(t); setError(''); setForm({ fullName: '', email: '', password: '' }); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (tab === 'signup') {
        await signup(form.fullName, form.email, form.password);
      } else {
        await login(form.email, form.password);
      }
      // No further action needed — App.js re-renders based on the now-set user/role.
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="card" style={{ width: 380 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Talent Console</div>
        <div style={{ fontSize: 11, color: 'var(--orange-500)', fontWeight: 600, letterSpacing: '0.06em', marginBottom: 20 }}>
          BIZ TECH ANALYTICS
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <button
            type="button"
            className={tab === 'signup' ? 'btn-primary' : 'btn-secondary'}
            style={{ flex: 1 }}
            onClick={() => switchTab('signup')}
          >
            Candidate Sign Up
          </button>
          <button
            type="button"
            className={tab === 'login' ? 'btn-primary' : 'btn-secondary'}
            style={{ flex: 1 }}
            onClick={() => switchTab('login')}
          >
            Recruiter Login
          </button>
        </div>

        {error && <div className="alert alert-error">⚠️ {error}</div>}

        <form onSubmit={handleSubmit}>
          {tab === 'signup' && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-500)', display: 'block', marginBottom: 5 }}>Full Name</label>
              <input
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                required
                style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)' }}
              />
            </div>
          )}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-500)', display: 'block', marginBottom: 5 }}>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
              style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)' }}
            />
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-500)', display: 'block', marginBottom: 5 }}>Password</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              minLength={tab === 'signup' ? 6 : undefined}
              style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)' }}
            />
          </div>
          <button className="btn-primary" type="submit" disabled={submitting} style={{ width: '100%', justifyContent: 'center' }}>
            {submitting ? 'Please wait...' : tab === 'signup' ? 'Create Account & Apply' : 'Log In'}
          </button>
        </form>

        {tab === 'login' && (
          <p style={{ fontSize: 11.5, color: 'var(--text-500)', marginTop: 14, marginBottom: 0 }}>
            Recruiter accounts are created by an admin (see <code>backend/seed/seedRecruiter.js</code>) — not through public signup.
          </p>
        )}
      </div>
    </div>
  );
}

export default AuthPage;