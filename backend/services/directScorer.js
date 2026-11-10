// Scores resumes by calling the Anthropic API straight from the ATS backend, so Resume Analyzer
// doesn't depend on the separate screener service (free Render instance that sleeps, and sits
// behind Cloudflare, which can answer server-to-server calls with a bot challenge instead of a score).
// Port of analyze_resume_for_sheet() in BTA-Resume-Screener: same prompts, same model, and the
// weighted average is computed here in code, not by the model. Weights are normalised.
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-5-5';
const EFFORT = 'medium';
// Thinking tokens count against max_tokens on Claude.
const MAX_TOKENS = 8000;
const CONCURRENCY = 15;
const MAX_ATTEMPTS = 4;
const REQUEST_TIMEOUT_MS = 90000;
const RETRYABLE_STATUS = new Set([408, 409, 413, 429, 500, 502, 503, 504, 529]);
const JD_LABEL = 'Overall fit to the job description as a whole';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (n) => Math.max(0, Math.min(100, Math.round(Number(n))));

function buildPrompts(jobDescription, resumeText, criteria, useJdScore) {
  if (!criteria.length && !useJdScore) {
    return {
      system: `You are a recruiter evaluating a resume against a job description.

## Task
1. skills: a comma-separated list of the candidate's technical and relevant non-technical skills (explicit and reasonably inferred from their projects/roles).
2. strongest_language: the ONE programming language the candidate has the most hands-on, production-level experience in, based solely on their resume (not the JD) - judge from depth/recency/volume of work shown, not just first-listed skill. A single language name (e.g. "Python"), or "" if none can be determined.
3. Write a short recruiter-style summary (3-5 sentences, plain text, no markdown) covering the candidate's experience, key projects, and how well they fit the job description - mention concrete strengths and gaps relative to the JD.
4. Score the candidate's overall fit against the job description on a 0-100 scale (0 = no fit, 100 = perfect fit), based on required skills, experience level, and responsibilities matched.

## Output Format (strictly follow this JSON structure, no extra text):
{
  "skills": "Python, Django, REST APIs, PostgreSQL, AWS, Docker",
  "strongest_language": "Python",
  "summary": "The candidate has 4 years of backend engineering experience building REST APIs in Python/Django and deploying on AWS. They have led feature delivery end-to-end on production systems, which aligns well with the JD's need for backend ownership. They lack direct Kubernetes experience, which the JD lists as a plus. Overall a strong match for the core technical requirements.",
  "score": 78
}

If skills or strongest_language cannot be found, use an empty string (""), and still provide your best-effort score.`,
      user: `Extract the candidate's skills and strongest language, write a summary, and score the fit as per the system instructions.

## Job Description:
${jobDescription}

## Resume:
${resumeText}

Output ONLY the JSON object as specified in the system prompt, with no additional text or formatting.`
    };
  }

  const hasCriteria = criteria.length > 0;
  const criteriaList = criteria.map((c, i) => `${i + 1}. ${c.text}`).join('\n');
  const rubricBlock = hasCriteria ? `\n\n## Rubric Criteria:\n${criteriaList}` : '';
  const scoresInstruction = hasCriteria
    ? `criteria_scores: for EACH numbered criterion below, judge how well the resume satisfies THAT SPECIFIC criterion on a 0-100 scale (0 = does not satisfy it at all, 100 = fully satisfies it), independent of the others and independent of the JD as a whole. Return exactly ${criteria.length} entries, in the SAME ORDER as listed, one per criterion - do not skip, merge, or reorder any.`
    : 'criteria_scores: return an empty list [] - there are no rubric criteria to score.';
  const jdInstruction = useJdScore
    ? "\n5. overall_jd_fit_score: judge the resume's overall fit against the job description AS A WHOLE (0-100), independent of the specific rubric criteria above - this is your general recruiter judgment of the full JD match."
    : '';
  const jdExample = useJdScore ? ',\n  "overall_jd_fit_score": 65' : '';
  const exampleScores = hasCriteria ? `[\n    {"criterion": ${JSON.stringify(criteria[0].text)}, "score": 78}\n  ]` : '[]';

  return {
    system: `You are a recruiter evaluating a resume against a job description${hasCriteria ? ' and a specific weighted scoring rubric' : ''}.

## Task
1. skills: a comma-separated list of the candidate's technical and relevant non-technical skills (explicit and reasonably inferred from their projects/roles).
2. strongest_language: the ONE programming language the candidate has the most hands-on, production-level experience in, based solely on their resume (not the JD) - judge from depth/recency/volume of work shown, not just first-listed skill. A single language name (e.g. "Python"), or "" if none can be determined.
3. Write a short recruiter-style summary (3-5 sentences, plain text, no markdown) covering the candidate's experience, key projects, and how well they fit the job description - mention concrete strengths and gaps relative to ${hasCriteria ? 'the rubric criteria and the JD' : 'the JD'}.
4. ${scoresInstruction}${jdInstruction}${rubricBlock}

## Output Format (strictly follow this JSON structure, no extra text):
{
  "skills": "Python, Django, REST APIs, PostgreSQL, AWS, Docker",
  "strongest_language": "Python",
  "summary": "The candidate has 4 years of backend engineering experience building REST APIs in Python/Django and deploying on AWS.",
  "criteria_scores": ${exampleScores}${jdExample}
}

If skills or strongest_language cannot be found, use an empty string (""). Do NOT include a top-level "score" field - the final score is computed separately from criteria_scores${useJdScore ? ' and overall_jd_fit_score' : ''}.`,
    user: `Extract the candidate's skills and strongest language, write a summary, and score the resume as per the system instructions.

## Job Description${hasCriteria ? ` (context for interpreting the rubric criteria${useJdScore ? '' : ', not scored directly'})` : ''}:
${jobDescription}

## Resume:
${resumeText}

Output ONLY the JSON object as specified in the system prompt, with no additional text or formatting.`
  };
}

// One Messages API call. Throws an Error with .status set for HTTP failures (retry decisions are the caller's).
async function callClaude(apiKey, system, user) {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: 'user', content: user }],
      output_config: { effort: EFFORT }
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`Anthropic API returned ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
    err.status = res.status;
    err.retryAfter = Number(res.headers.get('retry-after')) || 0;
    throw err;
  }
  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  return text.replace(/^```(?:json)?\s*|\s*```$/g, '');
}

const asText = (v) => (Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v));

// Turns the model's JSON into { skills, strongest_language, summary, score, criteria_breakdown? }, or
// throws when the generation is malformed (wrong number of criteria scores, missing score, empty) so it is retried.
function normalise(record, criteria, jdWeight, useJdScore) {
  const out = {
    skills: asText(record.skills),
    strongest_language: asText(record.strongest_language || record.strongest_skill),
    summary: asText(record.summary || record.recruiter_style_summary || record.recruiter_summary)
  };

  if (criteria.length || useJdScore) {
    const raw = record.criteria_scores || record.criterion_scores || [];
    if (!Array.isArray(raw) || raw.length !== criteria.length) throw new Error('malformed: criteria_scores length mismatch');
    let jdRaw;
    if (useJdScore) {
      jdRaw = record.overall_jd_fit_score ?? record.jd_fit_score;
      if (jdRaw == null) throw new Error('malformed: overall_jd_fit_score missing');
    }
    const breakdown = [];
    let sum = 0;
    let total = 0;
    criteria.forEach((c, i) => {
      const sub = Number.isFinite(Number(raw[i] && raw[i].score)) ? clamp(raw[i].score) : 0;
      breakdown.push({ criterion: c.text, weight: Number(c.weight), score: sub });
      sum += sub * Number(c.weight);
      total += Number(c.weight);
    });
    if (useJdScore) {
      const sub = Number.isFinite(Number(jdRaw)) ? clamp(jdRaw) : 0;
      breakdown.push({ criterion: JD_LABEL, weight: jdWeight, score: sub });
      sum += sub * jdWeight;
      total += jdWeight;
    }
    out.score = total > 0 ? Math.round(sum / total) : 0;
    out.criteria_breakdown = breakdown;
  } else {
    if (record.score == null) throw new Error('malformed: score missing');
    out.score = Number.isFinite(Number(record.score)) ? clamp(record.score) : 0;
  }

  if (!out.skills && !out.strongest_language && !out.summary && out.score === 0) throw new Error('malformed: empty generation');
  return out;
}

async function scoreOne(apiKey, jobDescription, resumeText, criteria, jdWeight, useJdScore) {
  const { system, user } = buildPrompts(jobDescription, resumeText, criteria, useJdScore);
  let lastErr;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const text = await callClaude(apiKey, system, user);
      return normalise(JSON.parse(text), criteria, jdWeight, useJdScore);
    } catch (err) {
      lastErr = err;
      const transient = RETRYABLE_STATUS.has(err.status) || err.name === 'TimeoutError' || err instanceof SyntaxError
        || /^malformed/.test(err.message) || /fetch failed|ECONNRESET/.test(err.message);
      // Auth / bad-request errors won't change on retry.
      if (!transient || attempt === MAX_ATTEMPTS - 1) break;
      await sleep(Math.min(30, err.retryAfter || 2 * 2 ** attempt) * 1000);
    }
  }
  if (lastErr && lastErr.status === 401) throw new Error('Anthropic API key was rejected (check ANTHROPIC_API_KEY on the server).');
  throw lastErr;
}

// resumes: [{id, resume_text}] -> [{id, result} | {id, error}] in input order, same shape the screener returns.
// One resume failing never fails the batch.
async function scoreResumesDirect(apiKey, jobDescription, resumes, criteria = [], jdWeight = 0) {
  const rubric = (criteria || []).filter((c) => c && String(c.text || '').trim() && Number(c.weight) > 0);
  const jdw = Number(jdWeight) > 0 ? Number(jdWeight) : 0;
  const useJdScore = jdw > 0;
  const results = new Array(resumes.length);
  let next = 0;
  const worker = async () => {
    while (next < resumes.length) {
      const i = next++;
      const { id, resume_text: text } = resumes[i];
      try {
        results[i] = { id, result: await scoreOne(apiKey, jobDescription, text, rubric, jdw, useJdScore) };
      } catch (err) {
        results[i] = { id, error: err.message };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, resumes.length) }, worker));
  return results;
}

module.exports = { scoreResumesDirect, buildPrompts, normalise };
