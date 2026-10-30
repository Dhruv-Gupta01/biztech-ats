jest.mock('pdf-parse', () => jest.fn(async () => ({ text: '  Jane Doe, Node.js engineer  ' })));
const { fetchResumeText, driveFileId } = require('../../services/resumeFetchService');

const respond = (body, ok = true, status = 200) => ({ ok, status, arrayBuffer: async () => Buffer.from(body) });

describe('driveFileId', () => {
  it('reads the id from /d/<id> and ?id= Drive links', () => {
    expect(driveFileId('https://drive.google.com/file/d/1AbC_-xyz/view?usp=sharing')).toBe('1AbC_-xyz');
    expect(driveFileId('https://drive.google.com/open?id=1AbC_-xyz')).toBe('1AbC_-xyz');
  });
  it('rejects non-Drive hosts, http and junk', () => {
    expect(driveFileId('https://evil.example.com/file/d/123')).toBeNull();
    expect(driveFileId('http://drive.google.com/file/d/123')).toBeNull();
    expect(driveFileId('not a url')).toBeNull();
  });
});

describe('fetchResumeText', () => {
  afterEach(() => { delete global.fetch; });

  it('returns the extracted text for a PDF', async () => {
    global.fetch = jest.fn(async () => respond('%PDF-1.4 ...'));
    expect(await fetchResumeText('https://drive.google.com/file/d/abc123/view')).toEqual({ text: 'Jane Doe, Node.js engineer' });
    expect(global.fetch.mock.calls[0][0]).toBe('https://drive.google.com/uc?export=download&id=abc123');
  });
  it('explains a non-public link (Drive HTML page instead of a PDF)', async () => {
    global.fetch = jest.fn(async () => respond('<html>Sign in</html>'));
    expect((await fetchResumeText('https://drive.google.com/file/d/abc123/view')).error).toMatch(/not publicly shared/);
  });
  it('never fetches non-Drive links', async () => {
    global.fetch = jest.fn();
    expect((await fetchResumeText('https://example.com/cv.pdf')).error).toMatch(/not a Google Drive link/);
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it('reports HTTP and network failures without throwing', async () => {
    global.fetch = jest.fn(async () => respond('', false, 404));
    expect((await fetchResumeText('https://drive.google.com/file/d/abc123/view')).error).toMatch(/HTTP 404/);
    global.fetch = jest.fn(async () => { throw new Error('boom'); });
    expect((await fetchResumeText('https://drive.google.com/file/d/abc123/view')).error).toMatch(/boom/);
  });
});
