// Central registry for employment types.
//
// Employment types used to live as hardcoded Mongoose enums plus ~15 duplicated
// string arrays scattered across controllers, services, seed scripts and React
// components. Adding or removing one meant editing all of them, and several
// lists had already drifted (some missing "Medical Hiring", some still carrying
// "Internship" which was never a valid model value).
//
// This module is the single source of truth on the backend:
//   - the DB collection is the source of truth,
//   - an in-memory cache keeps hot paths (model hooks, per-row CSV import)
//     from hitting Mongo on every write.
//
// The cache is refreshed on server start and after every registry mutation
// (create / update / delete), so it can never drift from the collection.

const EmploymentType = require('../models/EmploymentType');

// Used only until the collection is seeded. Keeps prefix behaviour working on a
// brand-new database that has never been through the seed script.
const FALLBACK_PREFIX_TYPES = [
  { name: 'FREELANCE CODING', prefix: 'F' },
  { name: 'Medical Hiring', prefix: 'M' }
];

const FALLBACK_DEFAULT = 'Full-Time';

let cache = [];
let cacheLoaded = false;

// Reloads the registry from Mongo. Called on boot and after every mutation.
async function refreshEmploymentTypes() {
  try {
    const docs = await EmploymentType.find({}).lean();
    cache = docs.sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name));
    cacheLoaded = true;
    return cache;
  } catch (err) {
    console.error('[EmploymentTypes] Failed to refresh registry:', err.message);
    cacheLoaded = false;
    return cache;
  }
}

// All registered employment types (including inactive ones).
function getEmploymentTypes() {
  return cache;
}

// Only the ones a recruiter may currently pick.
function getActiveEmploymentTypes() {
  return cache.filter((t) => t.isActive);
}

function getActiveNames() {
  return getActiveEmploymentTypes().map((t) => t.name);
}

function getDefaultName() {
  const def = cache.find((t) => t.isDefault && t.isActive);
  if (def) return def.name;
  const first = getActiveEmploymentTypes()[0];
  return first ? first.name : FALLBACK_DEFAULT;
}

// The prefix-based types drive the F / M role-code rule. Example: a role code
// starting with "F" resolves to the employment type registered with prefix "F".
function getPrefixTypes() {
  const registered = cache.filter((t) => t.isPrefixBased && t.prefix);
  if (registered.length) return registered;
  return FALLBACK_PREFIX_TYPES;
}

// Resolves the employment type a role code is forced into, or null when the
// role code carries no prefix rule.
function resolveByPrefix(roleCode) {
  if (!roleCode) return null;
  const code = String(roleCode).toUpperCase().trim();
  if (!code) return null;
  const match = getPrefixTypes().find((t) => code.startsWith(String(t.prefix).toUpperCase()));
  return match ? match.name : null;
}

function getLabel(name) {
  const found = cache.find((t) => t.name === name);
  return found && found.label ? found.label : name;
}

// Looks up a single registered type by name. Returns null when the registry is
// empty (not seeded yet) so callers can decide how strict to be.
function getByName(name) {
  if (!name) return null;
  return cache.find((t) => t.name === name) || null;
}

// True when the value is a known (active) employment type. An empty registry
// (not seeded yet) accepts anything so a fresh install is never blocked.
function isValidName(name) {
  if (!name) return false;
  if (!cacheLoaded || !cache.length) return true;
  return cache.some((t) => t.name === name);
}

// Seeds the starter set the first time the app runs against an empty
// collection. Existing collections are left untouched.
const DEFAULT_EMPLOYMENT_TYPES = [
  { name: 'Full-Time', label: 'Full Time', isPrefixBased: false, prefix: null, sortOrder: 1, description: 'Standard full-time employment', isDefault: true },
  { name: 'Part-Time', label: 'Part Time', isPrefixBased: false, prefix: null, sortOrder: 2, description: 'Part-time employment', isDefault: false },
  { name: 'Contract', label: 'Contractual', isPrefixBased: false, prefix: null, sortOrder: 3, description: 'Contract-based employment', isDefault: false },
  { name: 'Internship', label: 'Internship', isPrefixBased: false, prefix: null, sortOrder: 4, description: 'Internship positions', isDefault: false },
  { name: 'FREELANCE CODING', label: 'Freelance Coding', isPrefixBased: true, prefix: 'F', sortOrder: 5, description: 'Freelance coding assignments (role codes starting with F)', isDefault: false },
  { name: 'Medical Hiring', label: 'Medical Hiring', isPrefixBased: true, prefix: 'M', sortOrder: 6, description: 'Medical and healthcare hiring (role codes starting with M)', isDefault: false }
];

async function ensureDefaultEmploymentTypes() {
  try {
    const count = await EmploymentType.countDocuments();
    if (count > 0) return false;
    await EmploymentType.insertMany(DEFAULT_EMPLOYMENT_TYPES.map((t) => ({ ...t, isActive: true })));
    console.log('[EmploymentTypes] Seeded default employment types.');
    await refreshEmploymentTypes();
    return true;
  } catch (err) {
    console.error('[EmploymentTypes] Failed to seed default employment types:', err.message);
    return false;
  }
}

module.exports = {
  refreshEmploymentTypes,
  getEmploymentTypes,
  getActiveEmploymentTypes,
  getActiveNames,
  getDefaultName,
  getPrefixTypes,
  resolveByPrefix,
  getLabel,
  getByName,
  isValidName,
  ensureDefaultEmploymentTypes,
  DEFAULT_EMPLOYMENT_TYPES
};