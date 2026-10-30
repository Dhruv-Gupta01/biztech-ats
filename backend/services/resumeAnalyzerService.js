const API_BASE = 'https://bta-resume-screener.onrender.com';
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
const MAX_RETRIES = 3;
// A cold Render free instance takes about a minute to wake; edge answers 429/502/503 meanwhile.
const WAKE_TIMEOUT_MS = 90000;
const WAKE_POLL_MS = 4000;
// Each attempt gets its own timeout (a normal 20-resume chunk takes ~20s), and retries stop once the
// overall deadline passes, so one stalled call can't use up the time of every retry.
const ATTEMPT_TIMEOUT_MS = 120000;
const OVERALL_DEADLINE_MS = 300000;

// Polls the unauthenticated /health until the analyzer answers (or the deadline passes, then the caller retries anyway).
async function waitUntilAwake() {
  const deadline = Date.now() + WAKE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(8000) });
      if (res.ok) return;
    } catch (e) { /* still waking */ }
    await new Promise((r) => setTimeout(r, WAKE_POLL_MS));
  }
}
const API_KEY = 'OKqUW9Yfe7o9swI7nivsCVNHODnnwjAq8y0_9wsAulY';

// criteria ([{text, weight}]) and jdWeight are optional; with neither the analyzer returns one holistic 0-100 score.
async function scoreResumes(jobDescription, resumes, criteria = [], jdWeight = 0) {
  const deadline = Date.now() + OVERALL_DEADLINE_MS;

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
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS)
      });

      if (!response.ok) {
        const text = await response.text();
        // 429 / 502 / 503 / 504 come from Render's edge while the free instance wakes or is busy:
        // wait for it to answer /health (a cold start outlasts a few short sleeps), then try again.
        if (RETRYABLE_STATUS.has(response.status) && retries > 0) {
          await waitUntilAwake();
          const wait = Math.min(15, Number(response.headers.get('retry-after')) || 0);
          if (wait) await new Promise((r) => setTimeout(r, wait * 1000));
          return attempt(retries - 1);
        }
        throw new Error(`Resume analyzer API returned ${response.status}${text ? `: ${text.trim()}` : ''}`);
      }

      const data = await response.json();
      return data.results || [];
    } catch (err) {
      const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
      if (retries > 0 && Date.now() < deadline && (timedOut || err.message.includes('fetch failed') || err.message.includes('ECONNRESET'))) {
        // A stalled or dropped call usually means the free instance is waking or restarting.
        await waitUntilAwake();
        return attempt(retries - 1);
      }
      if (timedOut) throw new Error('Resume analyzer did not respond in time. Try again in a minute.');
      throw err;
    }
  };

  return attempt();
}

module.exports = { scoreResumes };
