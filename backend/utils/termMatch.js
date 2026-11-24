// Builds the case-insensitive regex source Skill Search uses to look for one term inside resume text.
//
// wholeWord (default): the term must stand on its own, so "java" no longer matches "javascript", "sql" no
// longer matches "mysql", and one-letter terms like "r" or "c" match the language, not every word that
// contains the letter. A "word" is a run of letters/digits, so punctuation still separates:
//   "node" matches "Node.js", "(node)", "node/express";  "sql" matches "PL/SQL";  "c" does not match "c++".
// Spaces in a multi-word term match any whitespace (PDF text often breaks lines mid-phrase).
// Terms that end in + or # (c++, c#) are never followed by another + or #.
// wholeWord=false keeps the old plain "contains" behaviour (finds "reactjs" for "react", "mysql" for "sql").
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildTermRegex(term, wholeWord = true) {
  const t = String(term || '').trim();
  const body = escapeRegex(t).replace(/\s+/g, '\\s+');
  if (!wholeWord) return body;
  const lead = /^[a-z0-9]/i.test(t) ? '(^|[^a-z0-9])' : '';
  const trail = '($|[^a-z0-9+#])';
  return `${lead}${body}${trail}`;
}

module.exports = { buildTermRegex, escapeRegex };
