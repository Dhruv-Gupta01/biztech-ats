// Known skill keywords matched against resume text (case-insensitive substring match).
// Extend this list as needed — it's the only place skill extraction logic depends on.
const SKILL_KEYWORDS = [
  'React', 'Node.js', 'Express', 'MongoDB', 'JavaScript', 'TypeScript', 'Python', 'Django',
  'Flask', 'Java', 'Spring', 'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'SQL', 'PostgreSQL',
  'MySQL', 'Redis', 'GraphQL', 'REST API', 'HTML', 'CSS', 'Tailwind', 'Redux', 'Next.js',
  'Selenium', 'Cypress', 'Jenkins', 'CI/CD', 'Git', 'Machine Learning', 'PyTorch', 'TensorFlow',
  'Pandas', 'NumPy', 'Tableau', 'Power BI', 'Excel', 'Agile', 'Scrum', 'Linux', 'C++', 'C#',
  '.NET', 'PHP', 'Ruby', 'Rails', 'Swift', 'Kotlin', 'Android', 'iOS', 'Figma', 'Photoshop'
];

module.exports = { SKILL_KEYWORDS };