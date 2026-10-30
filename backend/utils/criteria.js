// Weighted scoring rubric for a role: [{ text, weight }] plus an optional JD weight.
// Blank rows are dropped; a criterion with text but no positive weight is an error.
const MAX_CRITERIA = 20;
const MAX_TEXT = 500;

function normalizeCriteria(raw) {
  if (raw === undefined || raw === null) return { criteria: [] };
  if (!Array.isArray(raw)) return { error: 'criteria must be a list.' };
  const criteria = [];
  for (const c of raw) {
    const text = String((c && c.text) || '').trim();
    if (!text) continue;
    const weight = Number(c.weight);
    if (!(weight > 0)) return { error: 'Every criterion needs a weight greater than 0.' };
    if (text.length > MAX_TEXT) return { error: `Each criterion must be under ${MAX_TEXT} characters.` };
    criteria.push({ text, weight });
  }
  if (criteria.length > MAX_CRITERIA) return { error: `Use at most ${MAX_CRITERIA} criteria.` };
  return { criteria };
}

function normalizeJdWeight(raw) {
  if (raw === undefined || raw === null || raw === '') return { jdWeight: 0 };
  const jdWeight = Number(raw);
  if (Number.isNaN(jdWeight) || jdWeight < 0) return { error: 'JD weight must be 0 or more.' };
  return { jdWeight };
}

module.exports = { normalizeCriteria, normalizeJdWeight };
