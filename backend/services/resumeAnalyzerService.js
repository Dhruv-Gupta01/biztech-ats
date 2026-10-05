const API_BASE = 'https://bta-resume-screener.onrender.com';
const API_KEY = 'OKqUW9Yfe7o9swI7nivsCVNHODnnwjAq8y0_9wsAulY';

async function scoreResumes(jobDescription, resumes) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  const attempt = async (retries = 2) => {
    try {
      const response = await fetch(`${API_BASE}/score-resumes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY
        },
        body: JSON.stringify({
          job_description: jobDescription,
          resumes
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Resume analyzer API returned ${response.status}: ${text}`);
      }

      const data = await response.json();
      return data.results || [];
    } catch (err) {
      if (retries > 0 && (err.name === 'AbortError' || err.message.includes('fetch failed') || err.message.includes('ECONNRESET'))) {
        await new Promise(r => setTimeout(r, 1000));
        return attempt(retries - 1);
      }
      throw err;
    }
  };

  try {
    return await attempt();
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { scoreResumes };
