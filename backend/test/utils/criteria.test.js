const { normalizeCriteria, normalizeJdWeight } = require('../../utils/criteria');

describe('normalizeCriteria', () => {
  it('drops blank rows and coerces weights to numbers', () => {
    const r = normalizeCriteria([{ text: ' 3+ yrs Node.js ', weight: '70' }, { text: '', weight: '' }]);
    expect(r.criteria).toEqual([{ text: '3+ yrs Node.js', weight: 70 }]);
  });
  it('treats missing criteria as an empty rubric', () => {
    expect(normalizeCriteria(undefined).criteria).toEqual([]);
    expect(normalizeCriteria([]).criteria).toEqual([]);
  });
  it('rejects a filled criterion without a positive weight', () => {
    expect(normalizeCriteria([{ text: 'x', weight: 0 }]).error).toMatch(/weight/);
    expect(normalizeCriteria([{ text: 'x' }]).error).toMatch(/weight/);
  });
  it('rejects non-lists, too many rows and over-long text', () => {
    expect(normalizeCriteria('nope').error).toBeDefined();
    expect(normalizeCriteria(Array.from({ length: 21 }, () => ({ text: 'a', weight: 1 }))).error).toMatch(/at most 20/);
    expect(normalizeCriteria([{ text: 'a'.repeat(501), weight: 1 }]).error).toMatch(/500/);
  });
});

describe('normalizeJdWeight', () => {
  it('defaults blank to 0 and accepts numbers', () => {
    expect(normalizeJdWeight('').jdWeight).toBe(0);
    expect(normalizeJdWeight(undefined).jdWeight).toBe(0);
    expect(normalizeJdWeight('25').jdWeight).toBe(25);
  });
  it('rejects negatives and non-numbers', () => {
    expect(normalizeJdWeight(-1).error).toBeDefined();
    expect(normalizeJdWeight('abc').error).toBeDefined();
  });
});
