const pdfParse = require('pdf-parse');
const { SKILL_KEYWORDS } = require('../utils/skillKeywords');

// Best-effort heuristic extraction from raw resume text. This is NOT a proper
// resume-parsing model — it's regex + keyword matching, good enough to prefill
// a form for the candidate to review and correct, never to trust blindly.

function extractEmail(text) {
  const match = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return match ? match[0] : '';
}

function extractPhone(text) {
  const match = text.match(/(\+?\d{1,3}[-.\s]?)?\(?\d{3,5}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/);
  return match ? match[0].replace(/\s+/g, ' ').trim() : '';
}

function extractName(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  // Heuristic: first of the top few lines that looks like "First Last" (2-4 words,
  // letters only) and isn't an email/phone/URL line.
  for (const line of lines.slice(0, 6)) {
    if (/[@]/.test(line)) continue;
    if (/\d{5,}/.test(line)) continue;
    if (/https?:\/\//i.test(line)) continue;
    const words = line.split(/\s+/);
    if (words.length >= 2 && words.length <= 4 && /^[A-Za-z.\s'-]+$/.test(line)) {
      return line;
    }
  }
  return '';
}

function extractSkills(text) {
  const lower = text.toLowerCase();
  return SKILL_KEYWORDS.filter((skill) => lower.includes(skill.toLowerCase()));
}

// POST /api/candidates/parse-resume
// Accepts the same multipart 'resume' field as /apply. Returns best-guess field
// values for the frontend to prefill — it does not create a Candidate record.
exports.parseResume = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Resume PDF is required.' });
    }

    const dataBuffer = req.file.buffer;
    const parsed = await pdfParse(dataBuffer);
    const text = parsed.text || '';

    const data = {
      fullName: extractName(text),
      email: extractEmail(text),
      phone: extractPhone(text),
      skills: extractSkills(text)
    };

    return res.status(200).json({ success: true, message: 'Resume parsed.', data });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: `Could not parse resume: ${err.message}` });
  }
};