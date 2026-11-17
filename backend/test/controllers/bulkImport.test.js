// Bulk CSV import with a role code: Google-Form exports that name the email column "Email ID" and never ask
// for years of experience must import instead of being skipped row by row.
jest.mock('../../models/Candidate', () => ({ findOne: jest.fn(async () => null), create: jest.fn(async (d) => d) }));
jest.mock('../../models/Role', () => ({ findOne: jest.fn(async () => ({ code: "I - FOUNDER'S OFFICE", empType: 'Internship' })) }));
jest.mock('../../utils/employmentRegistry', () => ({
  resolveByPrefix: () => null,
  isValidName: (n) => ['Full-Time', 'Internship'].includes(n),
  getDefaultName: () => 'Full-Time'
}));
const Candidate = require('../../models/Candidate');
const { bulkImportWithRole } = require('../../controllers/bulkController');

const call = async (csv, roleCode = "I - FOUNDER'S OFFICE") => {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await bulkImportWithRole({ file: { buffer: Buffer.from(csv) }, body: { roleCode } }, res);
  return res.json.mock.calls[0][0];
};

const formCsv = [
  "Timestamp,Full Name,Email ID,Phone Number,Please upload your CV ,Please record a 1–2 minute video telling us why you want to work in the Founder's Office.,Tell us about your experience so far,Have you worked before or done any internships?,Where did you learn about this opportunity?,Which internship(s) or job(s) have you done?",
  '11/16/2026 0:15:26,Asha Rao,Asha@Example.com,+911234567890,https://drive.google.com/open?id=CV1,https://drive.google.com/open?id=VID1,Built things,Yes – internship(s),LinkedIn,Acme intern',
  '11/16/2026 0:20:00,Ben Roy,ben@example.com,+919999999999,https://drive.google.com/open?id=CV2,https://drive.google.com/open?id=VID2,Interned,No – this would be my first role,,'
].join('\n');

describe('bulkImportWithRole with a Google Form export', () => {
  beforeEach(() => { Candidate.create.mockClear(); Candidate.findOne.mockClear(); });

  it('imports rows whose email column is "Email ID" and that have no experience column', async () => {
    const out = await call(formCsv);
    expect(out.data).toMatchObject({ insertedCount: 2, skippedCount: 0 });
    const [first, second] = Candidate.create.mock.calls.map((c) => c[0]);
    expect(first).toMatchObject({ fullName: 'Asha Rao', email: 'asha@example.com', yearsOfExperience: 0, source: 'LinkedIn', resumeUrl: 'https://drive.google.com/open?id=CV1' });
    expect(second.source).toBe('CSV Import'); // blank "where did you learn" falls back
    expect(second.resumeUrl).toBe('https://drive.google.com/open?id=CV2'); // the CV, not the video
  });

  it('saves the video link, keeps it out of the resume, and puts the written answers in General Remarks', async () => {
    await call(formCsv);
    const [first, second] = Candidate.create.mock.calls.map((c) => c[0]);
    expect(first.videoUrl).toBe('https://drive.google.com/open?id=VID1');
    expect(first.resumeUrl).toBe('https://drive.google.com/open?id=CV1');
    expect(first.generalRemarks).toBe('Experience so far: Built things\nWorked before / internships: Yes – internship(s)\nInternship(s) or job(s) done: Acme intern');
    expect(second.generalRemarks).toBe('Experience so far: Interned\nWorked before / internships: No – this would be my first role'); // blank answer skipped
  });

  it('a missing CV never falls back to the video link', async () => {
    const out = await call('Full Name,Email ID,Phone Number,Please upload your CV,Please record a video\nA B,a@b.com,1,,https://drive.google.com/open?id=VID');
    expect(out.data.insertedCount).toBe(1);
    const c = Candidate.create.mock.calls[0][0];
    expect(c.resumeUrl).toBe('');
    expect(c.videoUrl).toBe('https://drive.google.com/open?id=VID');
  });

  it('matches headers regardless of case and spacing', async () => {
    const out = await call('FULL NAME, email  id ,phone number\nA B,a@b.com,123');
    expect(out.data.insertedCount).toBe(1);
  });

  it('still rejects a blank experience when the file does have that column', async () => {
    const out = await call('Full Name,Email,Phone,Years of Experience\nA B,a@b.com,123,\nC D,c@d.com,456,4');
    expect(out.data).toMatchObject({ insertedCount: 1, skippedCount: 1 });
    expect(out.data.errors[0].reason).toMatch(/Missing required field/);
  });

  it('still rejects a row with no email', async () => {
    const out = await call('Full Name,Email ID,Phone Number\nA B,,123');
    expect(out.data).toMatchObject({ insertedCount: 0, skippedCount: 1 });
  });
});
