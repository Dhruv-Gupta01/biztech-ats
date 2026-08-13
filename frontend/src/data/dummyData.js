// Preloaded realistic dummy data — used until backend endpoints for these modules exist.
// Swap for live API calls module-by-module without touching component code.

export const dummyCandidates = [
  { _id: 'c1', fullName: 'Priya Sharma', email: 'priya.sharma@example.com', phone: '9876543210', location: 'Bengaluru', roleCode: 'BTA-ENG-01', employmentType: 'Full-Time', yearsOfExperience: 4, ctcCurrent: 1200000, ctcExpected: 1600000, noticePeriod: '30 days', skills: ['React', 'Node.js', 'MongoDB'], resumeUrl: '#', status: 'Screened', source: 'LinkedIn', assessment: { status: 'In progress', skillScore: 8, experienceScore: 7, suitabilityRating: 7.6, remarks: 'Assessment scheduled, strong React fundamentals.' }, updatedAt: '2026-07-20', createdAt: '2026-07-20' },
  { _id: 'c2', fullName: 'Arjun Mehta', email: 'arjun.mehta@example.com', phone: '9876500011', location: 'Pune', roleCode: 'BTA-ENG-02', employmentType: 'Full-Time', yearsOfExperience: 6, ctcCurrent: 1800000, ctcExpected: 2400000, noticePeriod: '60 days', skills: ['Python', 'Django', 'AWS'], resumeUrl: '#', status: 'Shortlisted', source: 'Referral', assessment: { status: 'In progress', skillScore: 9, experienceScore: 8, suitabilityRating: 8.4, remarks: 'Strong technical depth on infra questions.' }, updatedAt: '2026-07-19', createdAt: '2026-07-19' },
  { _id: 'c3', fullName: 'Sneha Iyer', email: 'sneha.iyer@example.com', phone: '9123456789', location: 'Chennai', roleCode: 'BTA-DS-01', employmentType: 'Full-Time', yearsOfExperience: 3, ctcCurrent: 900000, ctcExpected: 1300000, noticePeriod: '15 days', skills: ['SQL', 'Python', 'Tableau'], resumeUrl: '#', status: 'Applied', source: 'Website', assessment: { status: 'Not started', skillScore: null, experienceScore: null, suitabilityRating: null, remarks: '' }, updatedAt: '2026-07-22', createdAt: '2026-07-22' },
  { _id: 'c4', fullName: 'Rahul Verma', email: 'rahul.verma@example.com', phone: '9988776655', location: 'Gurugram', roleCode: 'BTA-ENG-01', employmentType: 'Contract', yearsOfExperience: 2, ctcCurrent: 700000, ctcExpected: 950000, noticePeriod: '15 days', skills: ['React', 'TypeScript'], resumeUrl: '#', status: 'Interviewing', source: 'Naukri', assessment: { status: 'In progress', skillScore: 7, experienceScore: 6, suitabilityRating: 6.6, remarks: 'Decent fundamentals, needs system design practice.' }, updatedAt: '2026-07-18', createdAt: '2026-07-18' },
  { _id: 'c5', fullName: 'Kavya Nair', email: 'kavya.nair@example.com', phone: '9090909090', location: 'Kochi', roleCode: 'BTA-QA-01', employmentType: 'Full-Time', yearsOfExperience: 5, ctcCurrent: 1100000, ctcExpected: 1500000, noticePeriod: '30 days', skills: ['Selenium', 'Cypress', 'API Testing'], resumeUrl: '#', status: 'Hired', source: 'LinkedIn', assessment: { status: 'Selected', skillScore: 9, experienceScore: 9, suitabilityRating: 9.0, remarks: 'Cleared technical round, strong automation background.' }, updatedAt: '2026-07-13', createdAt: '2026-07-10' },
  { _id: 'c6', fullName: 'Devansh Rao', email: 'devansh.rao@example.com', phone: '9871234560', location: 'Bengaluru', roleCode: 'BTA-DS-01', employmentType: 'Full-Time', yearsOfExperience: 7, ctcCurrent: 2200000, ctcExpected: 2900000, noticePeriod: '90 days', skills: ['Machine Learning', 'Python', 'PyTorch'], resumeUrl: '#', status: 'Rejected', source: 'Referral', assessment: { status: 'Rejected', skillScore: 5, experienceScore: 5, suitabilityRating: 5.0, remarks: 'Rejected after L2 — expected CTC mismatch.' }, updatedAt: '2026-07-16', createdAt: '2026-07-15' },
  { _id: 'c7', fullName: 'Ananya Gupta', email: 'ananya.gupta@example.com', phone: '9012345678', location: 'Hyderabad', roleCode: 'BTA-ENG-02', employmentType: 'Full-Time', yearsOfExperience: 1, ctcCurrent: 500000, ctcExpected: 700000, noticePeriod: '7 days', skills: ['Node.js', 'MongoDB', 'Express'], resumeUrl: '#', status: 'Applied', source: 'Website', assessment: { status: 'Not started', skillScore: null, experienceScore: null, suitabilityRating: null, remarks: '' }, updatedAt: '2026-07-23', createdAt: '2026-07-23' },
  { _id: 'c8', fullName: 'Karan Malhotra', email: 'karan.malhotra@example.com', phone: '9345678901', location: 'Mumbai', roleCode: 'BTA-QA-01', employmentType: 'Full-Time', yearsOfExperience: 4, ctcCurrent: 1000000, ctcExpected: 1350000, noticePeriod: '30 days', skills: ['Selenium', 'Java', 'Jenkins'], resumeUrl: '#', status: 'Screened', source: 'Naukri', assessment: { status: 'In progress', skillScore: 7, experienceScore: 7, suitabilityRating: 7.0, remarks: 'Solid QA background, awaiting L1 feedback.' }, updatedAt: '2026-07-21', createdAt: '2026-07-21' }
];

export const dummyRoles = [
  { code: 'BTA-ENG-01', title: 'Frontend Engineer', department: 'Engineering', empType: 'Full-Time', status: 'Open', openings: 3 },
  { code: 'BTA-ENG-02', title: 'Backend Engineer', department: 'Engineering', empType: 'Full-Time', status: 'Open', openings: 2 },
  { code: 'BTA-DS-01', title: 'Data Scientist', department: 'Data & Analytics', empType: 'Full-Time', status: 'Open', openings: 1 },
  { code: 'BTA-QA-01', title: 'QA Automation Engineer', department: 'Quality', empType: 'Full-Time', status: 'On-Hold', openings: 1 },
  { code: 'BTA-PM-01', title: 'Product Manager', department: 'Product', empType: 'Full-Time', status: 'Closed', openings: 0 }
];

export const dummyActivity = [
  { id: 1, text: 'Priya Sharma moved to Screened for BTA-ENG-01', color: 'var(--blue)', time: '2h ago' },
  { id: 2, text: 'Arjun Mehta shortlisted for BTA-ENG-02', color: 'var(--purple)', time: '4h ago' },
  { id: 3, text: 'New application: Ananya Gupta for BTA-ENG-02', color: 'var(--text-300)', time: '6h ago' },
  { id: 4, text: 'Kavya Nair marked Hired for BTA-QA-01', color: 'var(--green)', time: '1d ago' },
  { id: 5, text: 'Devansh Rao rejected after L2 interview', color: 'var(--red)', time: '2d ago' }
];

export const statusFunnel = [
  { label: 'Applied', count: 42, color: '#6B7280' },
  { label: 'Screened', count: 26, color: 'var(--blue)' },
  { label: 'Shortlisted', count: 14, color: 'var(--purple)' },
  { label: 'Interviewing', count: 8, color: 'var(--amber)' },
  { label: 'Hired', count: 3, color: 'var(--green)' },
  { label: 'Rejected', count: 11, color: 'var(--red)' }
];

export const emailTemplates = [
  { id: 't1', name: 'Interview Invitation', subject: 'Interview Invitation – {{roleTitle}} at BizTech Analytics',
    body: `Hi {{candidateName}},

Thank you for applying to the {{roleTitle}} ({{roleCode}}) position at BizTech Analytics.

We'd like to invite you for an interview. Our recruiter will reach out shortly to confirm a slot.

Best regards,
BizTech Analytics Talent Team` },
  { id: 't2', name: 'Application Received', subject: 'We received your application – {{roleTitle}}',
    body: `Hi {{candidateName}},

This confirms we've received your application for {{roleTitle}} ({{roleCode}}). Our team is reviewing it and will follow up within 5 business days.

Best regards,
BizTech Analytics Talent Team` },
  { id: 't3', name: 'Rejection – Not Progressing', subject: 'Update on your application – {{roleTitle}}',
    body: `Hi {{candidateName}},

Thank you for your interest in {{roleTitle}}. After careful review, we've decided to move forward with other candidates at this time.

We'll keep your profile on file for future openings.

Best regards,
BizTech Analytics Talent Team` },
  { id: 't4', name: 'Assessment Form Request', subject: 'Next step: quick form for {{roleTitle}}',
    body: `Hi {{candidateName}},

As the next step for {{roleTitle}} ({{roleCode}}), please fill out this short form so we can move your application forward:

{{formLink}}

Best regards,
BizTech Analytics Talent Team` }
];

export const slackMappings = [
  { id: 's1', roleCode: 'BTA-ENG-01', channel: '#hiring-frontend', webhook: 'https://hooks.slack.com/services/T000/B000/xxxxENG01', active: true },
  { id: 's2', roleCode: 'BTA-ENG-02', channel: '#hiring-backend', webhook: 'https://hooks.slack.com/services/T000/B000/xxxxENG02', active: true },
  { id: 's3', roleCode: 'BTA-DS-01', channel: '#hiring-data-science', webhook: 'https://hooks.slack.com/services/T000/B000/xxxxDS01', active: false },
  { id: 's4', roleCode: 'BTA-QA-01', channel: '#hiring-qa', webhook: 'https://hooks.slack.com/services/T000/B000/xxxxQA01', active: true }
];