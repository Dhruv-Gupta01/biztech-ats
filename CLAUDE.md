# CLAUDE.md

# BizTech ATS — Agent Operating Instructions

This file guides Claude Code (and future developers) when working in this repository. Every section is based on the actual source code; nothing here is invented. Where behavior is unverified or incomplete, it is flagged explicitly.

## 1. Project Overview

BizTech ATS is a single-recruiter-org Applicant Tracking System / Talent Console:
- **Backend**: Express + Mongoose + MongoDB, port 5004.
- **Frontend**: Create React App (CRA), port 3000 (default).
- **Deployment**: Backend on Render; frontend on Vercel.

Purpose: apply → screen/score → interview stages → hire/reject, plus role management, Slack routing, email outreach, Google Form response sync, resume parsing, CSV import/export, Naukri ETL, data retention sweep, and dynamic employment-type management.

Repository layout:
```
biztech-ats/                 project root (this file here)
├── CLAUDE.md                this document
├── backend/                 Express/Mongo API (port 5004)
│   ├── server.js            entry point, routes, cron jobs
│   ├── config/db.js         Mongoose connection
│   ├── controllers/*        route handlers
│   ├── models/*             Mongoose schemas
│   ├── routes/*             Express routers
│   ├── middleware/*         auth, multer uploads
│   ├── services/*           external integrations + internal logic
│   ├── utils/*              employment registry, history, resume parser
│   ├── scripts/*            seed/migration one-offs
│   ├── seed/*               recruiter/email-template data seeding
│   ├── test/*               Jest unit tests + integration script
│   ├── .env                 runtime secrets (gitignored)
│   └── .env.example         example env var names (no secrets)
├── frontend/                CRA SPA
│   ├── src/
│   │   ├── api/api.js       single fetch layer
│   │   ├── auth/AuthContext.js  JWT session (localStorage ats_token)
│   │   ├── contexts/EmploymentTypesContext.js  dynamic employment-type cache
│   │   ├── components/*     React UI (recruiter + candidate dashboards)
│   │   ├── utils/*          columnOptions, employment, scoring helpers
│   │   └── data/dummyData.js  development demo data
│   │   ├── App.js           Gate → AuthPage / CandidateDashboard / RecruiterApp
│   │   └── index.js
│   ├── .env                 REACT_APP_API_URL (gitignored)
│   ├── .env.example         example frontend env names
│   ├── public/
│   └── build/               CRA production output (gitignored)
└── package-lock.json        empty placeholder at root (each side installs separately)
```

Each side has its own `package.json`/`node_modules` — install separately:
- `cd backend && npm install`
- `cd frontend && npm install`

## 2. Commands & Scripts

Backend (`backend/`):
| Script | Purpose |
|--------|---------|
| `npm start` | `node server.js` — production server |
| `npm run dev` | `nodemon server.js` — dev server (default port 5004) |
| `npm test` | `jest` unit tests (controllers, models, services, utils) |
| `npm run test:watch` | Jest watch mode |
| `npm run test:coverage` | Jest with coverage |
| `npm run test:integration` | `node test/ats-integration.js` — full backend API integration (only when run explicitly; never auto). Sets `EMAIL_ENABLED=false` so no real emails go out. |
| `npm run seed:recruiter` | `node seed/seedRecruiter.js "Name" email@x.com Pass123 [--reset]` |
| `npm run seed:email-templates` | `node seed/seedEmailTemplates.js` |
| `npm run seed:employment-types` | `node scripts/seedEmploymentTypes.js` |
| `npm run seed:candidates` | `node scripts/seedCandidates.js` |
| `npm run db:reset` | `node scripts/resetData.js` |
| `npm run migrate:freelance` | `node scripts/migrateFreelance.js` |
| `npm run calendly:whoami` | Discovers Calendly user/org URIs |

Frontend (`frontend/`):
| Script | Purpose |
|--------|---------|
| `npm start` | `react-scripts start` (dev server, port 3000) |
| `npm run build` | `react-scripts build` (production output in `frontend/build`) |

There is **no root package.json** and no root test/lint command. Never run root-level npm scripts. Never install packages or add dependencies without user approval.

## 3. Architecture

### 3.1 Backend layering (Express → Controller → Model)

```
routes/*.js        Express router + mount path
controllers/*.js   route handlers: validate → model → respond {success,message,data}
models/*.js        Mongoose schemas
services/*.js      external integrations + business logic
utils/*            shared helpers (employmentRegistry, history, resumeParser)
middleware/*       auth (requireAuth), multer uploads
config/db.js       Mongoose connection (MONGO_URI, retries)
server.js          route mounting, cron jobs, global error handler
```

Every controller function follows the same response shape:
```js
{ success: true, message: '...', data: ... }
{ success: false, message: '...' }   // error — real error only in console.error
```

Cross-cutting request flow:
```
HTTP request → route (controller lookup) → controller → Mongoose model → MongoDB
                                                      ↑
                                              service integrations (no-op-until-configured)
```

### 3.2 Frontend layering

```
App.js                      Gate: AuthPage / CandidateDashboard / RecruiterApp
RecruiterApp.js             tab switcher (views object, one active view at a time)
components/*.js             per-view UI + candidate profile modal
api/api.js                  single fetch layer (BASE_URL = REACT_APP_API_URL + /api)
auth/AuthContext.js         JWT in localStorage 'ats_token', session restore via GET /api/auth/me
contexts/EmploymentTypesContext.js  dynamic employment-type cache fetched once from /api/employment-types
utils/*                     columnOptions, employment rules, scoring helper
```

Routing is manual (`views[view] || Dashboard`), not a router library. `api.js` centralizes fetch: every call goes through `request()`, which throws a real `Error` on network failure or non-2xx. Never call `fetch` directly from components.

### 3.3 Authentication & authorization

- `POST /api/auth/signup` — creates `role: 'candidate'` only. Recruiter accounts are **never** created through the API.
- `POST /api/auth/login` — works for both `candidate` and `recruiter` roles; frontend routes based on JWT `role` claim.
- `GET /api/auth/me` — requires `requireAuth` middleware; restores session from stored token.
- `middleware/auth.js` exports `requireAuth` (JWT Bearer verify → `req.user = { id, role, email }`). It is wired onto **only** `GET /api/auth/me`. Candidate, role, Slack, dashboard, outreach, statistics, and retention routes are intentionally public/unauthenticated. If you add a route requiring login, apply `requireAuth` explicitly.
- Auth model: `User { fullName, email (unique), passwordHash, role ∈ ['candidate','recruiter'] }`.

## 4. Data Model (Mongoose schemas)

### Candidate (`models/Candidate.js`) — central document

| Field | Type | Notes |
|-------|------|-------|
| fullName | String, required, trimmed | PII |
| email | String, required, lowercase, indexed | unique-ish (dup checked in controller) |
| phone | String, required | |
| location | String | |
| roleCode | String, required, uppercased trimmed | canonical role identifier |
| employmentType | String, required, default 'Full-Time' | set via registry prefix rule for F/M role codes |
| yearsOfExperience | Number, required, min 0 | |
| ctcCurrent | Number, default 0 | |
| ctcExpected | Number, default 0 | |
| noticePeriod | String | e.g. "30 days" |
| skills | [String], default [] | semicolon-separated on CSV import |
| designation | String | |
| company | String | |
| education | String | |
| resumeUrl | String | PDF served via GET /api/candidates/:id/resume |
| resumeData | Buffer | raw PDF bytes (resume upload path) |
| resumeText | String | parsed text |
| screeningInterview | enum [Pass,Fail,Not Appeared,Rescheduled,Not interested,Referred to another position,Invited – not booked,Booked – no result yet,Appeared – result not recorded], default null | FREELANCE CODING/Contract columns |
| calendlyLinkSent | enum [Sent,Not Sent], default null | |
| calendlyLinkStatus | enum [Booked,Not Booked], default null | |
| ndaIca | enum [Sent,Not Sent,Signed,Not Signed,Doubt,Not Interested], default null | |
| slackStatus | enum [Joined,Not Joined,Not Interested], default null | |
| bootcampAttempts | enum [Attempt 1,Attempt 2,Attempt 3], default null | |
| bootcampStatus | enum [Pass,Fail,Full Fail,Not Active,Active,Direct to client], default null | |
| onboarding | enum [Sent,Not Sent,Not Interested,Done], default null | |
| bootcampBatches | [{batch, joined(Joined/Not joined/null), note}], default [] | bootcamp cohorts from the batch sheet; a person can be in several |
| project | String, default null | freelance project name |
| projectStatus | enum [On Hold,Complete,Not Active,In Pipeline,Banned / Disqualified], default null | |
| resumeAnalyzerStatus | enum [Selected,Not selected], default null | MEDICAL HIRING columns |
| medicalAssessments | enum [Sent,Not Sent], default null | |
| medicalAssessmentsSubmission | enum [Received,Not received,Not interested], default null | |
| medicalSubmissionsEvaluation | enum [Pass,Fail,Pending], default null | |
| medicalOnboarding | enum [Sent,Not sent,Done,Not done,Not interested], default null | |
| medicalSlack | enum [Joined,Not joined,Not interested], default null | |
| status | enum (18 pipeline values), default 'Information Form Response' | pipeline position |
| generalRemarks | String | |
| assessmentRemarks | String | |
| source | String, default 'Website' | Website/Referral/LinkedIn/Naukri/Form |
| slackGroup | String | |
| interviewProgress | [{stageName, interviewer, rating(1-5), feedback, completedAt}] | recruiter-only, ordered stage log |
| interviewRounds | Mixed, default {} | per-round status |
| assessmentStatus | enum [Not Set,Selected,Rejected,Not Appeared,Rescheduled,Not interested,Referred to another position], default 'Not Set' | assessment tracking (distinct from pipeline status) |
| cvScreening | enum [Not Set,Selected,Rejected,Refered to other position], default 'Not Set' | |
| joiningDateTentative | Date | |
| joiningDateConfirm | Date | |
| history | [{field, oldValue, newValue, changedBy, changedAt}] | audit trail |
| score | {skillScore(0-10), experienceScore(0-10), suitabilityRating(0-10), scoredAt} | from POST /:id/score |
| formSubmissions | [{formId, formName, submittedAt, matchedEmail, responses}] | Google Form sync results |
| createdAt, updatedAt | Date | timestamps |

### Role (`models/Role.js`)

| Field | Type | Notes |
|-------|------|-------|
| code | String, required, unique, uppercased trimmed | canonical role identifier |
| title | String, required | |
| department | String, required | |
| description | String, default '' | |
| empType | String, required, default 'Full-Time' | validated against registry; prefix rule enforced in pre-save |
| openings | Number, default 1, min 0 | |
| status | enum [Open,On-Hold,Closed], default 'Open' | |
| interviewStages | [String], default ['Recruiter Screen','Technical','Hiring Manager'] | ordered stage list |
| skills | [String], default [] | |
| minExperience | Number, default 0, min 0 | |
| notNegotiable | String, default '' | free-text (not boolean) |

Pre-save hook: `registry.getByName(empType)` must exist; if `isPrefixBased`, the role code must start with the registered prefix.

### EmploymentType (`models/EmploymentType.js`) — dynamic registry (source of truth)

| Field | Type | Notes |
|-------|------|-------|
| name | String, required, unique | e.g. 'Full-Time', 'FREELANCE CODING' |
| label | String | display name |
| isActive | Boolean, default true | recruiter can pick only active ones |
| isPrefixBased | Boolean, default false | drives F/M role-code rule |
| prefix | String | e.g. 'F', 'M' |
| sortOrder | Number, default 0 | ordering |
| description | String | |
| isDefault | Boolean, default false | fallback when none selected |

Indexes: `{name:1, isActive:1}`, `{prefix:1, isPrefixBased:1}`.

Seed set (inserted once on empty collection): Full-Time (default), Part-Time, Contract, Internship, FREELANCE CODING (prefix F), Medical Hiring (prefix M).

### Other models
- `User { fullName, email(unique), passwordHash, role }` — auth.
- `SlackMapping { roleCode(uppercased), channel, webhook, active }` — Slack group routing.
- `Project { name(unique) }` — freelance project names (Terminus, Snorkle, Alegion seeded).
- `EmailTemplate { name, subject, body, attachments[{type:'link'|'file', name, url, attachmentId, size}] }` — required name/subject/body.
- `OutreachAttachment { name, contentType, size, data(Buffer), uploadedBy }` — stored file bytes (durable, Render ephemeral FS-safe). MAX_FILE_SIZE=10MB, MAX_TOTAL_SIZE=30MB, MAX_FILES=10.
- `GoogleForm { isActive, roleCode, formUrl, formEmailEntryId }` — per-role outreach form config.
- `EtlRun`, `FormSyncRun`, `ImportReview` — cron/ETL run records.
- `EtlRun`, `FormSyncRun`, `ImportReview` — cron/ETL run records.

### Business rules
1. **Prefix rule (single source of truth)**: any role code starting with a prefix-based employment type's prefix is forced to that employment type. F → FREELANCE CODING, M → Medical Hiring. Applied in `Role.pre('save')`, `Candidate.pre('save')`, `Candidate.post('init')`, `roleController.createRole/updateRole`, `bulkController`, and candidate bulk-import/resume paths.
2. **Contract → Freelance columns**: Contract employment type shares the FREELANCE CODING column set (screeningInterview, calendlyLinkStatus, projectStatus, etc.) in `columnOptions.js`.
3. **No enum on `Candidate.employmentType` / `Role.empType`**: both are plain `String` with registry-based validation, so dynamically added types are accepted.
4. **Email template validation**: `createTemplate`/`updateTemplate` reject empty name/subject/body with 400.
5. **Suitability scoring**: `suitabilityRating = skillScore*0.6 + experienceScore*0.4` (0–10 inputs).
6. **Retention sweep**: daily cron at 2 AM + `POST /api/retention/run`. No-ops unless `RETENTION_ENABLED=true`. `Rejected` candidates untouched for `RETENTION_DAYS` (default 180) are anonymized (default, strips PII) or hard-deleted per `RETENTION_MODE`.
7. **Naukri ETL**: daily cron at 9 AM + `POST /api/etl/run`. Fetches newest CSV from Drive folder, inserts clean candidates, flags rest to Import Review queue. No-ops unless `ETL_ENABLED=true` and Drive creds present.

## 5. API Reference (verified against routes/controllers)

All base paths mount under `/api`. Responses are `{ success, message, data? }`.

### Auth (`authRoutes.js`)
| Method | Endpoint | Body / Query | Notes |
|--------|----------|--------------|-------|
| POST | `/api/auth/signup` | `{fullName, email, password}` | password ≥ 6 chars; role always 'candidate' |
| POST | `/api/auth/login` | `{email, password}` | returns JWT + `{id, fullName, email, role}` |
| GET | `/api/auth/me` | `Authorization: Bearer <token>` | requires requireAuth |

### Candidates (`candidateRoutes.js`)
| Method | Endpoint | Notes |
|--------|----------|-------|
| POST | `/api/candidates/parse-resume` | multipart `resume` (PDF, ≤5MB) |
| POST | `/api/candidates/bulk-import` | multipart CSV `file` (≤10MB) |
| POST | `/api/candidates/bulk-import-with-role` | CSV `file` + `roleCode` body |
| POST | `/api/candidates/apply` | multipart `resume` (candidate application) |
| POST | `/api/candidates/bulk-upload-resumes` | `resumes[]` (≤50 PDFs) + `roleCode` |
| GET | `/api/candidates/bootcamp-batches` | batch labels with candidate counts (feeds the Bootcamp Batches filter; `options=bootcampBatch&optionValue=<batch>` on the list filters by batch) |
| POST | `/api/candidates/bootcamp-batches/assign` | `{batch, joined?, note?, candidateIds?[], candidates?[{fullName,email,phone}]}` add people to a batch (a new label creates the batch); new emails create CODING / Freelance / source Bootcamp candidates |
| POST | `/api/candidates/bootcamp-batches/remove` | `{batch, candidateIds[]}` take people out of one batch |
| GET | `/api/candidates` | query: roleCode, status, employmentType, source, minExperience, maxExperience, minSuitability, screeningInterview, calendlyLinkSent, calendlyLinkStatus, ndaIca, slackStatus, bootcampAttempts, bootcampStatus, onboarding, project, projectStatus, **options** (statusColumn field), **optionValue** (statusColumnValue) |
| POST | `/api/candidates/:id/score` | `{skillScore, experienceScore}` |
| POST | `/api/candidates/:id/interview-stage` | `{interviewer, rating, feedback}` |
| POST | `/api/candidates/:id/analyze` | resume analyzer |
| POST | `/api/candidates/analyze-bulk` | `{candidateIds[]}` |
| POST | `/api/candidates/:id/calendly-status` | best-effort Calendly lookup |
| PATCH | `/api/candidates/:id` | update fields |
| DELETE | `/api/candidates/:id` | hard delete |
| GET | `/api/candidates/:id/resume` | serve stored PDF |

### Roles (`roleRoutes.js`)
| Method | Endpoint | Notes |
|--------|----------|-------|
| GET | `/api/roles` | list, sorted createdAt desc |
| POST | `/api/roles` | create; attempts LinkedIn + Naukri post (no-op until creds set) |
| PATCH | `/api/roles/:code` | update; prefix rule enforced |
| DELETE | `/api/roles/:code` | delete |

### Slack Groups (`slackRoutes.js`)
| Method | Endpoint | Notes |
|--------|----------|-------|
| GET | `/api/slack-mappings` | list |
| POST | `/api/slack-mappings` | create |
| POST | `/api/slack-mappings/assign` | `{candidateIds[], slackMappingId, changedBy}` bulk assign |
| PATCH | `/api/slack-mappings/:id` | update |
| DELETE | `/api/slack-mappings/:id` | delete |

### Dashboard (`dashboardRoutes.js`)
| Method | Endpoint | Notes |
|--------|----------|-------|
| GET | `/api/dashboard/metrics` | query `roleCode` optional |

### Outreach (`outreachRoutes.js`)
| Method | Endpoint | Notes |
|--------|----------|-------|
| POST | `/api/outreach/attachments` | multipart `files[]` (≤10, ≤10MB each, ≤30MB total) |
| GET | `/api/outreach/attachments` | list metadata |
| DELETE | `/api/outreach/attachments/:id` | delete stored file |
| POST | `/api/outreach/send` | `{candidateIds[], subject, body, attachments[], attachmentIds[]}` |

### Email Templates (`emailTemplateRoutes.js`) — public, no auth middleware
| Method | Endpoint | Notes |
|--------|----------|-------|
| GET | `/api/email-templates` | list |
| GET | `/api/email-templates/:id` | get one |
| POST | `/api/email-templates` | create (rejects blank name/subject/body) |
| PUT | `/api/email-templates/:id` | update (rejects blank fields) |
| DELETE | `/api/email-templates/:id` | delete |

### Statistics (`statisticsRoutes.js`)
| Method | Endpoint | Notes |
|--------|----------|-------|
| GET | `/api/statistics` | filters: startDate, endDate, portal, roleCode, status, employmentType, minScore, maxScore, minExperience, maxExperience, location, statusColumn, statusColumnValue |
| GET | `/api/statistics/export/csv` | same filters → CSV file |

### Retention (`retentionRoutes.js`)
| Method | Endpoint | Notes |
|--------|----------|-------|
| GET | `/api/retention/status` | config |
| POST | `/api/retention/run` | manual sweep |

### ETL / Naukri (`etlRoutes.js`)
| Method | Endpoint | Notes |
|--------|----------|-------|
| GET | `/api/etl/status` | config |
| POST | `/api/etl/run` | manual import |
| GET | `/api/etl/reviews` | list Import Review queue |
| POST | `/api/etl/reviews/:id/approve` | `{rawData, changedBy}` insert candidate |
| POST | `/api/etl/reviews/:id/dismiss` | `{changedBy}` |

### Form Sync (`formSyncRoutes.js`)
| Method | Endpoint | Notes |
|--------|----------|-------|
| GET | `/api/form-sync/status` | config |
| POST | `/api/form-sync/run` | manual Google Form response sync |
| GET | `/api/form-sync/forms` | list forms |
| POST | `/api/form-sync/forms` | create |
| PATCH | `/api/form-sync/forms/:id` | update |
| DELETE | `/api/form-sync/forms/:id` | delete |

### Projects (`projectRoutes.js`)
| Method | Endpoint | Notes |
|--------|----------|-------|
| GET | `/api/projects` | list (seeds Terminus/Snorkle/Alegion if empty) |
| POST | `/api/projects` | create |
| DELETE | `/api/projects/:id` | delete |

### Employment Types (`employmentTypeRoutes.js`)
| Method | Endpoint | Notes |
|--------|----------|-------|
| GET | `/api/employment-types` | `?includeInactive=true`; active types ordered by sortOrder |
| POST | `/api/employment-types` | create (prefix-based requires prefix) |
| PATCH | `/api/employment-types/:name` | update |
| DELETE | `/api/employment-types/:name` | hard delete; refuses if referenced by roles/candidates or is default |
| PATCH | `/api/employment-types/:name/deactivate` | soft-delete (isActive=false); refuses default |

## 6. Integrations (all no-op-until-configured)

Each integration returns `{posted/sent: false, reason}` when disabled or credential-less, never blocks the primary DB write, and reports outcome alongside the main result.

| Service | File | Env flag | Credentials | Behavior when unconfigured |
|---------|------|----------|-------------|---------------------------|
| Email (Resend) | `services/emailService.js` | `EMAIL_ENABLED=true` | `RESEND_API_KEY`, `EMAIL_FROM` | no-op, reason returned |
| LinkedIn job post | `services/linkedinService.js` | `LINKEDIN_API_ENABLED=true` | `LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_ORG_ID` | no-op, partner API not self-serve |
| Naukri job post | `services/naukriService.js` | `NAUKRI_API_ENABLED=true` | `NAUKRI_API_KEY`, `NAUKRI_RECRUITER_ID` | no-op, partner API |
| Calendly lookup | `services/calendlyService.js` | `CALENDLY_API_ENABLED=true` | `CALENDLY_API_TOKEN`, optional `CALENDLY_USER_URI`/`CALENDLY_ORGANIZATION` | recruiter picks dropdown manually |
| Google Drive / Naukri ETL | `services/googleDriveService.js` | `DRIVE_SYNC_ENABLED=true` / `ETL_ENABLED=true` | service account key file/key, `GOOGLE_DRIVE_FOLDER_ID` | no-op |
| Google Form sync | `services/formSyncService.js` | `FORM_SYNC_ENABLED=true` | `GOOGLE_FORM_URL`, `GOOGLE_FORM_EMAIL_ENTRY_ID`, `GOOGLE_FORM_RESPONSE_SHEET_ID` | manual button only |
| Resume analyzer (external) | `services/resumeAnalyzerService.js` | none (always calls) | `https://bta-resume-screener.onrender.com` + API key | best-effort retries |

Env var **names** (never values — secrets are gitignored):
- Backend: `MONGO_URI`, `PORT`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `EMAIL_ENABLED`, `RESEND_API_KEY`, `EMAIL_FROM`, `DRIVE_SYNC_ENABLED`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, `GOOGLE_SERVICE_ACCOUNT_KEY_FILE`, `GOOGLE_DRIVE_FOLDER_ID`, `NAUKRI_API_ENABLED`, `NAUKRI_API_KEY`, `NAUKRI_RECRUITER_ID`, `NAUKRI_API_URL`, `FORM_SYNC_ENABLED`, `GOOGLE_FORM_URL`, `GOOGLE_FORM_EMAIL_ENTRY_ID`, `GOOGLE_FORM_RESPONSE_SHEET_ID`, `LINKEDIN_API_ENABLED`, `LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_ORG_ID`, `COMPANY_CAREERS_URL`, `RETENTION_ENABLED`, `RETENTION_DAYS`, `RETENTION_MODE`, `CALENDLY_API_ENABLED`, `CALENDLY_API_TOKEN`, `CALENDLY_USER_URI`, `CALENDLY_ORGANIZATION`, `CALENDLY_API_URL`.
- Frontend: `REACT_APP_API_URL` (Vercel: `https://biztech-ats-backend-0jpt.onrender.com`; local: `http://localhost:5004`).

### Cron jobs (registered in `server.js`)
| Schedule | Job | No-op when |
|----------|-----|------------|
| `0 2 * * *` | retention sweep | `RETENTION_ENABLED !== 'true'` |
| `0 9 * * *` | Naukri CSV ETL import | `ETL_ENABLED !== 'true'` or no Drive creds |

## 7. Frontend Views & Components

`RecruiterApp.js` tabs (via `Sidebar.js` links):

| Tab id | Component | Purpose |
|--------|-----------|---------|
| dashboard | `Dashboard.js` | metrics |
| pool | `CandidatePool.js` | candidate table + filters + CSV import/export + resume analyzer + Slack assign + Calendly bulk check |
| skills | `SkillSearch.js` | skill-based candidate search + outreach |
| outreach | `AssessmentOutreach.js` | email outreach to candidates with attachments + template manager |
| apply | `CandidateForm.js` (`allowManualSource`) | recruiter application form with manual/referral source picker |
| import | `ImportReview.js` | ETL import review queue |
| roles | `RolesCodes.js` | role CRUD + **Manage Employment Types** (create/deactivate/delete) |
| slack | `SlackGroups.js` | Slack mapping CRUD |
| forms | `GoogleForms.js` | Google Form config |
| roleCodeData | `RoleCodeData.js` | role code statistics |
| bulkUpload | `BulkResumeUpload.js` | bulk resume PDF upload |
| statistics | `StatisticsReport.js` | funnel + Pipeline Funnel charts + CSV export |

Key shared utilities:
- `utils/employment.js`: `isFreelanceRoleCode`, `isMedicalRoleCode`, `isFreelanceCandidate`, `isMedicalCandidate`, `isFreelanceFilter`, `isMedicalFilter`, `effectiveEmploymentType`, `typeLabel`, `EMPLOYMENT_TYPES`.
- `utils/columnOptions.js`: `STATUS_OPTIONS`, `INTERVIEW_ROUND_OPTIONS`, `ASSESSMENT_STATUS_OPTIONS`, `CV_SCREENING_OPTIONS`, `getColumnsForType(type)`, `getOptionsForColumn(field, candidates)`, `getColumnValue(candidate, field)`.
- `utils/scoring.js`: suitability scoring helper.

Context:
- `contexts/EmploymentTypesContext.js`: `EmploymentTypesProvider` + `useEmploymentTypes()` providing `employmentTypes[]`, `typeLabel(name)`, `getByName`, `resolveByPrefix(code)`, `isValidName(name)`, `create/update/delete/deactivateEmploymentType`. Wrapped in `App.js` around `Gate`.

API client (`api/api.js`): one `request()` wrapper, all exports listed in section 5.

## 8. AI Coding Rules (follow these strictly)

1. **Reuse existing patterns**: match controller response shape `{success,message,data}`, error via `console.error` + 500, route→controller→model layering, `req.body` destructuring.
2. **Minimal changes**: edit only what the task requires. Do not refactor unrelated code.
3. **Preserve existing features**: never remove an endpoint, filter, or integration. Prefix rule (F→Freelance Coding, M→Medical Hiring) must stay intact.
4. **Security**: never log or commit secrets, tokens, credentials, or candidate PII. `.env`, `frontend/.env`, `backend/uploads/**`, `biotech-ats-drive-key.json` are gitignored — keep them that way.
5. **No unnecessary dependencies**: do not add npm packages without user approval.
6. **Protect user changes**: do not modify uncommitted work without asking.
7. **Run relevant tests**: after backend changes run `npm test` in `backend/`; after frontend changes run `npm run build` in `frontend/`. Run `npm run test:integration` only when explicitly asked.
8. **Read comments before changing nearby code**: comments in this codebase are load-bearing (they document SRD references and intentional tradeoffs). Preserve comment density.
9. **Auth is opt-in**: apply `requireAuth` explicitly on any new route that needs login; do not assume global auth.
10. **Integrations never block**: follow the no-op-until-configured pattern with a clear `reason` string.

## 9. Limitations / Unverified / Technical Debt

- **Auth coverage**: only `GET /api/auth/me` uses `requireAuth`. All other routes are public by design (documented in `middleware/auth.js`), not an oversight — but this is a security consideration for production.
- **LinkedIn / Naukri job posting**: not self-serve APIs; require partner agreements. Code is a documented placeholder — never tested against live partner accounts. Role creation succeeds regardless.
- **Resume analyzer**: external service at `bta-resume-screener.onrender.com` with hardcoded API key in `services/resumeAnalyzerService.js` — best-effort heuristic, not a trustworthy extractor.
- **Calendly**: requires a personal access token; `CALENDLY_USER_URI`/`CALENDLY_ORGANIZATION` auto-discovered from `/users/me` if blank.
- **Dummy data**: `frontend/src/data/dummyData.js` exists but its usage in the running app is unverified (may be dev-only).
- **EmploymentType registry**: backend cache is in-memory; refreshed on boot and after mutations. Frontend fetches once on mount with fallback to `EMPLOYMENT_TYPES` if backend unavailable. If a recruiter adds a type while a tab is open, other open tabs won't see it until refreshed.
- **Candidate status enum** vs **interviewStatus/assessmentStatus**: separate concepts; `status` is pipeline position, `assessmentStatus` is assessment tracking — easy to conflate.
- **`notNegotiable`** on Role is a `String` textbox, not a boolean — verify intent before changing.
- **No root package.json**: each side installs separately; no root test/lint command exists.
- **Jest test ignore pattern**: `test:watch`/`test:coverage` use `jest --testPathIgnorePatterns=atsecomprehensive` (likely a typo for `ats-integration`); `npm test` ignores it too.
- **Frontend `StatisticsReport.js`** still contains legacy fallback employment-type arrays in places; the dynamic context is preferred where migrated.
- **`candidateSchema.post('init')`** enforces prefix rule on reads as well as writes — be aware this mutates documents in memory on load.

## 10. Verification performed

- Read all backend route files (`backend/routes/*.js`) and matched to controllers.
- Read `server.js`, `config/db.js`, `middleware/*.js`, `jest.config.js`.
- Read key models: `Candidate.js`, `Role.js`, `EmploymentType.js`, `User.js`, `emailTemplate.js`, `SlackMapping.js`, `Project.js`, `OutreachAttachment.js`.
- Read controllers: `candidateController.js`, `roleController.js`, `bulkController.js`, `outreachController.js`, `statisticsController.js`, `employmentTypeController.js`, `authController.js`.
- Read services: `emailService.js`, `retentionService.js`, `linkedinService.js`, `naukriService.js`, `calendlyService.js`, `formSyncService.js`, `resumeAnalyzerService.js`.
- Read utils: `employmentRegistry.js`, `columnOptions.js`, `employment.js`, `history.js`, `resumeParser.js`, `skillKeywords.js`.
- Read frontend: `App.js`, `RecruiterApp.js`, `Sidebar.js`, `AuthContext.js`, `api/api.js`, `contexts/EmploymentTypesContext.js`, `utils/columnOptions.js`, `utils/employment.js`, and all 12 view components.
- Confirmed backend build/lint: `npm test` passes (5 suites, 55 tests) and `npm run test:integration` (13 suites) passed.
- Confirmed frontend `npm run build` compiles cleanly with zero errors/warnings after the employment-type context migration.
- Confirmed `.gitignore` excludes `.env`, `frontend/.env`, `backend/uploads/**`, `biotech-ats-drive-key.json`, `frontend/build/`, `node_modules/`.
- No application code, dependencies, configs, or database data were modified during this documentation pass; only `CLAUDE.md` was written.

**File documented**: `/Users/vikas/Documents/biztech-ats/CLAUDE.md`
**Major areas covered**: project overview, commands, architecture, API reference, data model, integrations/cron/env vars, frontend views/components, AI coding rules, limitations, verification.
