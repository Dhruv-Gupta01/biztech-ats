// Which backend scoreResumes picks from the environment: OpenAI (gpt-6-luna) > Anthropic (Haiku) > screener service.
jest.mock('../../services/directScorer', () => ({ scoreResumesDirect: jest.fn(async () => [{ id: 'a', result: { score: 1 } }]) }));
const { scoreResumesDirect } = require('../../services/directScorer');
const { scoreResumes } = require('../../services/resumeAnalyzerService');

describe('scoreResumes provider choice', () => {
  const saved = { o: process.env.OPENAI_API_KEY, a: process.env.ANTHROPIC_API_KEY };
  beforeEach(() => { scoreResumesDirect.mockClear(); delete process.env.OPENAI_API_KEY; delete process.env.ANTHROPIC_API_KEY; });
  afterAll(() => { if (saved.o) process.env.OPENAI_API_KEY = saved.o; if (saved.a) process.env.ANTHROPIC_API_KEY = saved.a; });

  it('uses gpt-6-luna when OPENAI_API_KEY is set, even if an Anthropic key is also set', async () => {
    process.env.OPENAI_API_KEY = 'oa'; process.env.ANTHROPIC_API_KEY = 'an';
    await scoreResumes('jd', [{ id: 'a', resume_text: 'x' }], [{ text: 'c', weight: 1 }], 5);
    expect(scoreResumesDirect).toHaveBeenCalledWith('oa', 'jd', [{ id: 'a', resume_text: 'x' }], [{ text: 'c', weight: 1 }], 5, 'openai');
  });

  it('falls back to Claude Haiku when only ANTHROPIC_API_KEY is set', async () => {
    process.env.ANTHROPIC_API_KEY = 'an';
    await scoreResumes('jd', [{ id: 'a', resume_text: 'x' }]);
    expect(scoreResumesDirect).toHaveBeenCalledWith('an', 'jd', [{ id: 'a', resume_text: 'x' }], [], 0, 'anthropic');
  });

  it('goes through the screener service when neither key is set', async () => {
    global.fetch = jest.fn(async () => { throw new Error('screener reached'); });
    jest.useFakeTimers({ doNotFake: ['nextTick'] });
    const p = scoreResumes('jd', [{ id: 'a', resume_text: 'x' }]).then(() => null, (e) => e);
    await jest.runAllTimersAsync();
    jest.useRealTimers();
    await p;
    expect(scoreResumesDirect).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalled();
    delete global.fetch;
  });
});
