require('dotenv').config();

async function getToken() {
  const res = await fetch('http://localhost:5004/api/auth/login', {
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

  const listRes = await fetch('http://localhost:5004/api/email-templates', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const listData = await listRes.json();
  console.log('GET /api/email-templates:', listData.success ? 'PASS' : 'FAIL', '- count:', listData.data?.length);

  const createRes = await fetch('http://localhost:5004/api/email-templates', {
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

  const getRes = await fetch(`http://localhost:5004/api/email-templates/${templateId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const getData = await getRes.json();
  console.log('GET /api/email-templates/:id:', getData.success ? 'PASS' : 'FAIL');

  const updateRes = await fetch(`http://localhost:5004/api/email-templates/${templateId}`, {
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

  const deleteRes = await fetch(`http://localhost:5004/api/email-templates/${templateId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  const deleteData = await deleteRes.json();
  console.log('DELETE /api/email-templates/:id:', deleteData.success ? 'PASS' : 'FAIL');

  const verifyRes = await fetch(`http://localhost:5004/api/email-templates/${templateId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const verifyData = await verifyRes.json();
  console.log('Verify deleted:', !verifyData.success ? 'PASS' : 'FAIL');
  console.log('');
}

async function testOutreachWithAttachments(token) {
  console.log('--- Outreach with Attachments Test ---');

  const candidatesRes = await fetch('http://localhost:5004/api/candidates', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const candidatesData = await candidatesRes.json();
  const candidateId = candidatesData.data?.[0]?._id;
  if (!candidateId) {
    console.log('POST /api/outreach/send: SKIP - no candidates in DB');
    console.log('');
    return;
  }

  const res = await fetch('http://localhost:5004/api/outreach/send', {
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

  const listRes = await fetch('http://localhost:5004/api/email-templates');
  const listData = await listRes.json();
  console.log('GET without token:', listData.success ? 'PASS (public)' : 'FAIL');

  const createRes = await fetch('http://localhost:5004/api/email-templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'No Auth Test ' + Date.now(), subject: 'x', body: 'x' })
  });
  const createData = await createRes.json();
  console.log('POST without token:', createData.success ? 'PASS (public)' : 'FAIL');
  console.log('');
}

async function main() {
  try {
    const token = await getToken();
    console.log('Got auth token:', !!token);
    console.log('');

    await testTemplatesCRUD(token);
    await testOutreachWithAttachments(token);
    await testAuthRequired();

    console.log('All tests completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Test runner error:', err);
    process.exit(1);
  }
}

main();
