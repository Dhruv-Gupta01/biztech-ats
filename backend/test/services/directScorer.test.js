const { scoreResumesDirect } = require('../../services/directScorer');

const reply = (obj, status = 200) => ({
  ok: status === 200, status,
  headers: { get: () => null },
  text: async () => JSON.stringify(obj),
  json: async () => ({ content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] })
});
const model = (record) => reply(record);
const criteria = [{ text: 'Python', weight: 30 }, { text: 'Docker', weight: 10 }];

describe('scoreResumesDirect', () => {
  beforeEach(() => { jest.useFakeTimers({ doNotFake: ['nextTick'] }); });
  afterEach(() => { jest.useRealTimers(); delete global.fetch; });

  const run = async (p) => { const done = p.then((v) => v, (e) => { throw e; }); await jest.runAllTimersAsync(); return done; };

  it('computes the weighted average in code, JD fit included, weights normalised', async () => {
    global.fetch = jest.fn(async () => model({ skills: 'Python', strongest_language: 'Python', summary: 's', criteria_scores: [{ score: 80 }, { score: 40 }], overall_jd_fit_score: 60 }));
    const [r] = await run(scoreResumesDirect('k', 'jd', [{ id: 'a', resume_text: 'x' }], criteria, 20));
    // (80*30 + 40*10 + 60*20) / 60 = 66.67 -> 67
    expect(r.result.score).toBe(67);
    expect(r.result.criteria_breakdown.map((b) => b.score)).toEqual([80, 40, 60]);
    expect(r.result.strongest_language).toBe('Python');
  });

  it('uses the single holistic score when there is no rubric', async () => {
    global.fetch = jest.fn(async () => model({ skills: 'Go', strongest_language: 'Go', summary: 's', score: 72 }));
    const [r] = await run(scoreResumesDirect('k', 'jd', [{ id: 'a', resume_text: 'x' }]));
    expect(r.result.score).toBe(72);
    expect(r.result.criteria_breakdown).toBeUndefined();
  });

  it('sends the key, model and the JD + rubric in the request', async () => {
    global.fetch = jest.fn(async () => model({ skills: '', strongest_language: '', summary: 's', criteria_scores: [{ score: 1 }, { score: 1 }] }));
    await run(scoreResumesDirect('secret-key', 'THE JD', [{ id: 'a', resume_text: 'THE RESUME' }], criteria, 0));
    const [url, opts] = global.fetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(opts.headers['x-api-key']).toBe('secret-key');
    expect(body.model).toBe('claude-haiku-5-5');
    expect(body.system).toContain('1. Python');
    expect(body.messages[0].content).toContain('THE JD');
    expect(body.messages[0].content).toContain('THE RESUME');
  });

  it('retries a 429 and a malformed generation, then succeeds', async () => {
    const seq = [reply({}, 429), model({ summary: 's', criteria_scores: [{ score: 50 }] }), model({ summary: 's', criteria_scores: [{ score: 50 }, { score: 50 }] })];
    global.fetch = jest.fn(async () => seq.shift());
    const [r] = await run(scoreResumesDirect('k', 'jd', [{ id: 'a', resume_text: 'x' }], criteria, 0));
    expect(r.result.score).toBe(50);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('does not retry a rejected key and reports it clearly; one failure does not fail the batch', async () => {
    global.fetch = jest.fn(async (url, opts) => {
      const text = JSON.parse(opts.body).messages[0].content;
      return text.includes('BAD') ? reply({}, 401) : model({ skills: 'x', summary: 's', score: 60 });
    });
    const out = await run(scoreResumesDirect('k', 'jd', [{ id: 'a', resume_text: 'ok' }, { id: 'b', resume_text: 'BAD' }]));
    expect(out[0].result.score).toBe(60);
    expect(out[1].error).toMatch(/key was rejected/);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('keeps results in input order', async () => {
    global.fetch = jest.fn(async (url, opts) => model({ skills: 'x', summary: 's', score: Number(JSON.parse(opts.body).messages[0].content.match(/R(\d+)/)[1]) }));
    const resumes = [3, 1, 2].map((n) => ({ id: `id${n}`, resume_text: `R${n}` }));
    const out = await run(scoreResumesDirect('k', 'jd', resumes));
    expect(out.map((o) => [o.id, o.result.score])).toEqual([['id3', 3], ['id1', 1], ['id2', 2]]);
  });
});

describe('scoreResumesDirect with OpenAI (gpt-6-luna)', () => {
  beforeEach(() => { jest.useFakeTimers({ doNotFake: ['nextTick'] }); });
  afterEach(() => { jest.useRealTimers(); delete global.fetch; });
  const run = async (p) => { const done = p.then((v) => v, (e) => { throw e; }); await jest.runAllTimersAsync(); return done; };
  const openai = (obj, status = 200) => ({
    ok: status === 200, status,
    headers: { get: () => null },
    text: async () => JSON.stringify(obj),
    json: async () => ({ choices: [{ message: { content: typeof obj === 'string' ? obj : JSON.stringify(obj) } }] })
  });

  it('calls chat completions with gpt-6-luna, medium reasoning effort and JSON output', async () => {
    global.fetch = jest.fn(async () => openai({ skills: 'Go', strongest_language: 'Go', summary: 's', criteria_scores: [{ score: 80 }, { score: 40 }], overall_jd_fit_score: 60 }));
    const [r] = await run(scoreResumesDirect('sk-test', 'THE JD', [{ id: 'a', resume_text: 'THE RESUME' }], criteria, 20, 'openai'));
    const [url, opts] = global.fetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(opts.headers.authorization).toBe('Bearer sk-test');
    expect(opts.headers['x-api-key']).toBeUndefined();
    expect(body).toMatchObject({ model: 'gpt-6-luna', reasoning_effort: 'medium', response_format: { type: 'json_object' }, max_completion_tokens: 8000 });
    expect(body.max_tokens).toBeUndefined();
    expect(body.messages[0]).toMatchObject({ role: 'system' });
    expect(body.messages[0].content).toContain('1. Python');
    expect(body.messages[1].content).toContain('THE JD');
    expect(body.messages[1].content).toContain('THE RESUME');
    // same weighted average as the Anthropic path: (80*30 + 40*10 + 60*20) / 60 -> 67
    expect(r.result.score).toBe(67);
  });

  it('reads a fenced reply, retries a 429, and names OPENAI_API_KEY when the key is rejected', async () => {
    const seq = [openai({}, 429), openai('```json\n{"skills":"x","summary":"s","score":55}\n```')];
    global.fetch = jest.fn(async () => seq.shift());
    const [ok] = await run(scoreResumesDirect('k', 'jd', [{ id: 'a', resume_text: 'x' }], [], 0, 'openai'));
    expect(ok.result.score).toBe(55);

    global.fetch = jest.fn(async () => openai({}, 401));
    const [bad] = await run(scoreResumesDirect('k', 'jd', [{ id: 'a', resume_text: 'x' }], [], 0, 'openai'));
    expect(bad.error).toMatch(/OpenAI API key was rejected.*OPENAI_API_KEY/);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects an unknown provider', async () => {
    await expect(scoreResumesDirect('k', 'jd', [], [], 0, 'nope')).rejects.toThrow(/Unknown resume analyzer provider/);
  });
});
