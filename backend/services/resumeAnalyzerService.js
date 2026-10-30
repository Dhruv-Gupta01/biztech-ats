const API_BASE = 'https://bta-resume-screener.onrender.com';
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
const MAX_RETRIES = 3;
const API_KEY = 'OKqUW9Yfe7o9swI7nivsCVNHODnnwjAq8y0_9wsAulY';

// criteria ([{text, weight}]) and jdWeight are optional; with neither the analyzer returns one holistic 0-100 score.
async function scoreResumes(jobDescription, resumes, criteria = [], jdWeight = 0) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 150000);

  const attempt = async (retries = MAX_RETRIES) => {
    try {
      const response = await fetch(`${API_BASE}/score-resumes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY
        },
        body: JSON.stringify({
          job_description: jobDescription,
          resumes,
          ...(criteria.length ? { criteria } : {}),
          ...(jdWeight > 0 ? { jd_weight: jdWeight } : {})
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const text = await response.text();
        // 429 / 502 / 503 / 504 come from Render's edge while the free instance wakes or is busy:
        // wait (honouring Retry-After, capped) and try again instead of failing the whole run.
        if (RETRYABLE_STATUS.has(response.status) && retries > 0) {
          const wait = Math.min(15, Number(response.headers.get('retry-after')) || (MAX_RETRIES - retries + 1) * 4);
          await new Promise((r) => setTimeout(r, wait * 1000));
          return attempt(retries - 1);
        }
        throw new Error(`Resume analyzer API returned ${response.status}${text ? `: ${text.trim()}` : ''}`);
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
