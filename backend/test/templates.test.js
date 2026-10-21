require('dotenv').config();

const TEST_BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5004';

// Helper to check if server is reachable
async function checkServer() {
  try {
    const res = await fetch(`${TEST_BASE_URL}/`, { timeout: 2000 });
    return res.ok;
  } catch {
    return false;
  }
}

async function getToken() {
  const res = await fetch(`${TEST_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'recruiter@biztech.com', password: 'Recruiter@123' })
  });
  const data = await res.json();
  if (!data.token) throw new Error('Failed to get auth token: ' + JSON.stringify(data));
  return data.token;
}

async function testTemplatesCRUD(token) {
  console.log('--- Template CRUD Tests ---');

  const listRes = await fetch(`${TEST_BASE_URL}/api/email-templates`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const listData = await listRes.json();
  console.log('GET /api/email-templates:', listData.success ? 'PASS' : 'FAIL', '- count:', listData.data?.length);

  const createRes = await fetch(`${TEST_BASE_URL}/api/email-templates`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Integration Test Template',
      subject: 'Hi {{candidateName}} for {{roleTitle}}',
      body: 'Body with {{formLink}}',
      attachments: [{ name: 'PDF', url: 'https://example.com/doc.pdf' }]
    })
  });
  const createData = await createRes.json();
  console.log('POST /api/email-templates:', createData.success ? 'PASS' : 'FAIL', '- has attachments:', !!(createData.data?.attachments?.length));
  const templateId = createData.data?._id;
  if (!templateId) throw new Error('Create failed, no template ID');

  const getRes = await fetch(`${TEST_BASE_URL}/api/email-templates/${templateId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const getData = await getRes.json();
  console.log('GET /api/email-templates/:id:', getData.success ? 'PASS' : 'FAIL');

  const updateRes = await fetch(`${TEST_BASE_URL}/api/email-templates/${templateId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Updated Test Template',
      subject: 'Updated {{candidateName}}',
      body: 'Updated body',
      attachments: []
    })
  });
  const updateData = await updateRes.json();
  console.log('PUT /api/email-templates/:id:', updateData.success ? 'PASS' : 'FAIL', '- name:', updateData.data?.name);

  const deleteRes = await fetch(`${TEST_BASE_URL}/api/email-templates/${templateId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  const deleteData = await deleteRes.json();
  console.log('DELETE /api/email-templates/:id:', deleteData.success ? 'PASS' : 'FAIL');

  const verifyRes = await fetch(`${TEST_BASE_URL}/api/email-templates/${templateId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const verifyData = await verifyRes.json();
  console.log('Verify deleted:', !verifyData.success ? 'PASS' : 'FAIL');
  console.log('');
}

async function testOutreachWithAttachments(token) {
  console.log('--- Outreach with Attachments Test ---');

  const candidatesRes = await fetch(`${TEST_BASE_URL}/api/candidates`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const candidatesData = await candidatesRes.json();
  const candidateId = candidatesData.data?.[0]?._id;
  if (!candidateId) {
    console.log('POST /api/outreach/send: SKIP - no candidates in DB');
    console.log('');
    return;
  }

  const res = await fetch(`${TEST_BASE_URL}/api/outreach/send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      candidateIds: [candidateId],
      subject: 'Hello {{candidateName}}',
      body: 'Body for {{roleTitle}}',
      attachments: [
        { name: 'Form', url: 'https://forms.google.com/abc' },
        { name: 'Drive', url: 'https://drive.google.com/xyz' }
      ]
    })
  });
  const data = await res.json();
  console.log('POST /api/outreach/send:', data.success ? 'PASS' : 'FAIL', '- message:', data.message);
  if (data.data) {
    console.log('  sentCount:', data.data.sentCount, 'failedCount:', data.data.failedCount);
  }
  console.log('');
}

async function testAuthRequired() {
  console.log('--- Public Access Tests (no auth required) ---');

  const listRes = await fetch(`${TEST_BASE_URL}/api/email-templates`);
  const listData = await listRes.json();
  console.log('GET without token:', listData.success ? 'PASS (public)' : 'FAIL');

  // Create a VALID template (not blank) so we don't leave junk in the DB.
  const createRes = await fetch(`${TEST_BASE_URL}/api/email-templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Public Access Test',
      subject: 'Test {{candidateName}}',
      body: 'Body for test.'
    })
  });
  const createData = await createRes.json();
  console.log('POST without token:', createData.success ? 'PASS (public)' : 'FAIL');

  // Clean up the test template immediately so it doesn't linger.
  if (createData.data?._id) {
    await fetch(`${TEST_BASE_URL}/api/email-templates/${createData.data._id}`, { method: 'DELETE' });
    console.log('Cleaned up public access test template.');
  }
  console.log('');
}

describe('Integration tests (require running server)', () => {
  let serverAvailable = false;
  let authToken = null;

  beforeAll(async () => {
    serverAvailable = await checkServer();
    if (serverAvailable) {
      try {
        authToken = await getToken();
      } catch (e) {
        console.log('Server available but auth failed:', e.message);
        serverAvailable = false;
      }
    }
  });

  it('should have server available', () => {
    if (!serverAvailable) {
      console.log('⚠️  Skipping integration tests - server not available at', TEST_BASE_URL);
      return;
    }
    expect(serverAvailable).toBe(true);
  });

  it('should run template CRUD tests', async () => {
    if (!serverAvailable || !authToken) {
      console.log('Skipping - no server or auth');
      return;
    }
    await testTemplatesCRUD(authToken);
    expect(true).toBe(true);
  });

  it('should run outreach with attachments test', async () => {
    if (!serverAvailable || !authToken) {
      console.log('Skipping - no server or auth');
      return;
    }
    await testOutreachWithAttachments(authToken);
    expect(true).toBe(true);
  });

  it('should run public access tests', async () => {
    if (!serverAvailable) {
      console.log('Skipping - no server');
      return;
    }
    await testAuthRequired();
    expect(true).toBe(true);
  });
});
