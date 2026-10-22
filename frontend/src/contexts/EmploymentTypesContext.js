// React Context that provides the employment type registry to all components.
// Fetches from the backend API at /api/employment-types once on mount and
// uses the cache for all downstream lookups. Keeps dashboards (Candidate Pool,
// Skill Search, Statistics Report, Assessment & Outreach, Role Code Data) in
// sync when a recruiter adds / removes / reorders types via the Manage screen.

import React, { createContext, useContext, useState, useEffect } from 'react';
import { fetchEmploymentTypes, createEmploymentType, updateEmploymentType, deleteEmploymentType, deactivateEmploymentType } from '../api/api';
import { EMPLOYMENT_TYPES } from '../utils/employment';

const EmploymentTypesContext = createContext({
  employmentTypes: [],           // [{name, label, isActive, isPrefixBased, prefix, sortOrder}]
  loading: true,
  typeLabel: (t) => t,
  getByName: (name) => null,
  resolveByPrefix: (code) => null,
  isValidName: (name) => Boolean(name),
  createEmploymentType: () => Promise.reject(new Error('not implemented')),
  updateEmploymentType: () => Promise.reject(new Error('not implemented')),
  deleteEmploymentType: () => Promise.reject(new Error('not implemented')),
  deactivateEmploymentType: () => Promise.reject(new Error('not implemented')),
});

export const EmploymentTypesProvider = ({ children }) => {
  const [employmentTypes, setEmploymentTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchEmploymentTypes()
      .then((res) => {
        if (!cancelled) {
          const fetched = (res && res.data) || [];
          // Fall back to built-in defaults when the backend isn't seeded/running,
          // so every dropdown still renders the core set.
          if (fetched.length) {
            setEmploymentTypes(fetched);
          } else {
            setEmploymentTypes(EMPLOYMENT_TYPES.map(name => ({ name, label: name, isActive: true, isPrefixBased: false, sortOrder: 0 })));
          }
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('[EmploymentTypes] Failed to fetch:', err);
          setError(err.message || 'Unknown error');
          setEmploymentTypes(EMPLOYMENT_TYPES.map(name => ({ name, label: name, isActive: true, isPrefixBased: false, sortOrder: 0 })));
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  // Derived helpers
  const typeLabel = (t) => {
    if (!t) return t;
    const found = employmentTypes.find((et) => et.name === t);
    if (found && found.label) return found.label;
    // Legacy display map (safety net when the registry hasn't loaded yet)
    if (t === 'Contract') return 'Contractual';
    if (t === 'Part-Time') return 'Part Time';
    if (t === 'FREELANCE CODING') return 'Freelance Coding';
    if (t === 'Medical Hiring') return 'Medical Hiring';
    // Unknown (dynamically added) type — show the raw name
    return t;
  };

  const getByName = (name) => {
    if (!name) return null;
    return employmentTypes.find((et) => et.name === name) || null;
  };

  const resolveByPrefix = (code) => {
    if (!code) return null;
    const codeStr = String(code).toUpperCase().trim();
    if (!codeStr) return null;
    const matched = employmentTypes.find(
      (et) => et.isPrefixBased && et.prefix && codeStr.startsWith(String(et.prefix).toUpperCase())
    );
    return matched ? matched.name : null;
  };

  const isValidName = (name) => Boolean(name) && employmentTypes.some((et) => et.name === name);

  // CRUD helpers (recruiter-facing)
  const handleCreate = async (data) => {
    setError('');
    try {
      const res = await createEmploymentType(data);
      setEmploymentTypes((prev) => {
        const newType = { ...res.data, sortOrder: Math.max(0, res.data.sortOrder || 0) };
        return [newType, ...prev].sort((a, b) => a.sortOrder - b.sortOrder);
      });
    } catch (err) {
      setError(err.message || 'Failed to create employment type');
    }
  };

  const handleUpdate = async (name, data) => {
    setError('');
    try {
      await updateEmploymentType(name, data);
      setEmploymentTypes((prev) =>
        prev.map((et) => (et.name === name ? { ...et, ...data } : et)).sort((a, b) => a.sortOrder - b.sortOrder)
      );
    } catch (err) {
      setError(err.message || 'Failed to update employment type');
    }
  };

  const handleDelete = async (name) => {
    setError('');
    try {
      await deleteEmploymentType(name);
      setEmploymentTypes((prev) => prev.filter((et) => et.name !== name));
    } catch (err) {
      setError(err.message || 'Failed to delete employment type');
    }
  };

  const handleDeactivate = async (name) => {
    setError('');
    try {
      await deactivateEmploymentType(name);
      setEmploymentTypes((prev =>
        prev.map((et) => (et.name === name ? { ...et, isActive: false } : et)).sort((a, b) => a.sortOrder - b.sortOrder)
      ));
    } catch (err) {
      setError(err.message || 'Failed to deactivate employment type');
    }
  };

  // Value is the same for all descendants
  const value = {
    employmentTypes,
    loading,
    error,
    typeLabel,
    getByName,
    resolveByPrefix,
    isValidName,
    createEmploymentType: handleCreate,
    updateEmploymentType: handleUpdate,
    deleteEmploymentType: handleDelete,
    deactivateEmploymentType: handleDeactivate,
  };

  return (
    <EmploymentTypesContext.Provider value={value}>
      {children}
    </EmploymentTypesContext.Provider>
  );
};

export const useEmploymentTypes = () => useContext(EmploymentTypesContext);

export default EmploymentTypesContext;