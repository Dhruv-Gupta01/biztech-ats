const { buildTermRegex } = require('../../utils/termMatch');

const matches = (term, text, wholeWord = true) => new RegExp(buildTermRegex(term, wholeWord), 'i').test(text);

describe('buildTermRegex (whole word)', () => {
  it('does not match inside a longer word', () => {
    expect(matches('java', 'Skills: JavaScript, TypeScript')).toBe(false);
    expect(matches('sql', 'worked with MySQL and PostgreSQL')).toBe(false);
    expect(matches('go', 'Google Cloud, going forward')).toBe(false);
    expect(matches('ai', 'maintained the mail system')).toBe(false);
  });
  it('matches a standalone term, any case, with punctuation around it', () => {
    expect(matches('java', 'Languages: Java, Python')).toBe(true);
    expect(matches('java', 'JAVA')).toBe(true);
    expect(matches('sql', 'PL/SQL developer')).toBe(true);
    expect(matches('node', 'Node.js, Express')).toBe(true);
    expect(matches('react', '(React) and Redux')).toBe(true);
  });
  it('handles one-letter languages', () => {
    expect(matches('r', 'Languages: R, Python')).toBe(true);
    expect(matches('r', 'Research and reporting')).toBe(false);
    expect(matches('c', 'C, C++ and Java')).toBe(true);
    expect(matches('c', 'only C++ here')).toBe(false);
  });
  it('handles terms ending in + or #', () => {
    expect(matches('c++', 'Strong in C++, STL')).toBe(true);
    expect(matches('c++', 'C+++')).toBe(false);
    expect(matches('c#', 'C#, .NET')).toBe(true);
    expect(matches('c#', 'ac#')).toBe(false);
  });
  it('treats a multi-word term as one phrase across spaces and line breaks', () => {
    expect(matches('machine learning', 'Machine\n  Learning engineer')).toBe(true);
    expect(matches('machine learning', 'machine-learning')).toBe(false);
  });
  it('escapes regex characters in the term', () => {
    expect(matches('.net', 'ASP.NET core')).toBe(true);
    expect(matches('a(b', 'a(b')).toBe(true);
  });
});

describe('buildTermRegex (contains)', () => {
  it('keeps the old substring behaviour when whole word is off', () => {
    expect(matches('java', 'JavaScript', false)).toBe(true);
    expect(matches('react', 'ReactJS', false)).toBe(true);
  });
});
