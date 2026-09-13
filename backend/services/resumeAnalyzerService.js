const API_BASE = 'https://bta-resume-screener.onrender.com';
const API_KEY = 'OKqUW9Yfe7o9swI7nivsCVNHODnnwjAq8y0_9wsAulY';

async function scoreResumes(jobDescription, resumes) {
  const response = await fetch(`${API_BASE}/score-resumes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY
    },
    body: JSON.stringify({
      job_description: jobDescription,
      resumes
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Resume analyzer API returned ${response.status}: ${text}`);
  }

  const data = await response.json();
  return data.results || [];
}

module.exports = { scoreResumes };
