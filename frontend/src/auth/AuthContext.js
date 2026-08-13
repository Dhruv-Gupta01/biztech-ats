import React, { createContext, useContext, useEffect, useState } from 'react';
import { signup as apiSignup, login as apiLogin, fetchMe } from '../api/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // On first load, restore a previous session from localStorage (if the token still validates).
  useEffect(() => {
    const stored = localStorage.getItem('ats_token');
    if (!stored) { setLoading(false); return; }

    fetchMe(stored)
      .then((res) => { setToken(stored); setUser(res.user); })
      .catch(() => { localStorage.removeItem('ats_token'); })
      .finally(() => setLoading(false));
  }, []);

  const signup = async (fullName, email, password) => {
    const res = await apiSignup({ fullName, email, password });
    localStorage.setItem('ats_token', res.token);
    setToken(res.token);
    setUser(res.user);
    return res.user;
  };

  const login = async (email, password) => {
    const res = await apiLogin({ email, password });
    localStorage.setItem('ats_token', res.token);
    setToken(res.token);
    setUser(res.user);
    return res.user;
  };

  const logout = () => {
    localStorage.removeItem('ats_token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, signup, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}