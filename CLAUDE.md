# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

BizTech ATS — an applicant tracking system with an Express/MongoDB backend and a
Create React App frontend, backing a single-recruiter-org hiring pipeline
(apply → screen/score → interview stages → hire/reject) plus role management,
Slack routing, email outreach, and a data-retention sweep for rejected candidates.

## Commands

Backend (`backend/`):
```
npm run dev              # nodemon server.js — dev server, default port 5004
npm start                # node server.js
npm run seed:recruiter   # creates/resets a recruiter account (candidates self-signup; recruiters cannot)
```
`seed:recruiter` takes optional positional args: `node seed/seedRecruiter.js "Name" email@x.com Password123 [--reset]`.
No test suite or linter is configured in either package.

Frontend (`frontend/`):
```
npm start   # react-scripts start
npm run build
```

Each side has its own `package.json`/`node_modules` — install separately in `backend/` and `frontend/`.
Backend config lives in `backend/.env` (`MONGO_URI`, `PORT`, `JWT_SECRET`, LinkedIn/SMTP/retention keys — see below); frontend uses `frontend/.env` (`REACT_APP_API_URL`, defaults to `http://localhost:5004/api`).

## Architecture

**Backend** is a standard Express layering: `routes/` → `controllers/` → `models/` (Mongoose), with cross-cutting logic in `services/` and small shared helpers in `utils/`. Every controller function follows the same shape: validate body, hit Mongoose, return `{ success, message, data }` (or `{ success: false, message }` on error), with `console.error` + 500 as the catch-all. Match this shape for any new endpoint.

**Auth is opt-in, not global.** `middleware/auth.js` exports `requireAuth` (JWT bearer check), but it is only wired onto `GET /api/auth/me`. Candidate, role, Slack, dashboard, outreach, and retention routes are intentionally public/unauthenticated — this is documented in the middleware file, not an oversight. If you add a route that should require login, apply `requireAuth` explicitly.

**Auth model**: `POST /api/auth/signup` only ever creates `role: 'candidate'` accounts. Recruiter accounts can only be created via `backend/seed/seedRecruiter.js` (run manually, never through the API). `POST /api/auth/login` works for both roles; the frontend routes post-login based on the JWT's `role` claim (`frontend/src/App.js`'s `Gate` component picks `CandidateDashboard` vs `RecruiterApp`).

**Candidate is the central document.** `models/Candidate.js` holds pipeline `status` (Applied→Screened→Shortlisted→Interviewing→Rejected/Hired), a separate `assessmentStatus` (Not started/In progress/Selected/Not selected — tracks the assessment itself, not pipeline position, per the SRD), `interviewProgress[]` (ordered log of completed stages, each with rating/feedback — recruiter-only, never exposed to the candidate), and `history[]` (an audit trail). Any endpoint that mutates a tracked field (`status`, `roleCode`, `generalRemarks`, `assessmentRemarks`, `slackGroup`, `assessmentStatus`) should route the change through `utils/history.js`'s `buildHistoryEntries()` so it lands in `history[]` — see `candidateController.updateCandidate`/`scoreCandidate` and `slackController.bulkAssignToSlackGroup` for the pattern.

**Interview stages are role-driven.** `Role.interviewStages` (default `['Recruiter Screen', 'Technical', 'Hiring Manager']`) defines the ordered stage list per role; a candidate's *next* stage is `role.interviewStages[candidate.interviewProgress.length]`. `POST /:id/interview-stage` (`recordInterviewStage`) appends to `interviewProgress`, then best-effort emails the candidate a status update (never the scorecard/rating — those stay internal per the SRD).

**Suitability scoring**: `POST /:id/score` computes `suitabilityRating = skillScore*0.6 + experienceScore*0.4` (both 0–10 inputs) and auto-advances `status` from `Applied` to `Screened` if not explicitly overridden.

**Best-effort external integrations, one consistent pattern.** LinkedIn job posting (`services/linkedinService.js`), Naukri posting (`services/naukriService.js`), email (`services/emailService.js`, Nodemailer/SMTP), and Slack webhook notifications (`slackController.bulkAssignToSlackGroup`) all: (1) no-op with a clear `reason` string when their `*_ENABLED` env flag is off or credentials are missing, (2) never block or fail the primary DB write, (3) report their own outcome back in the response alongside the main result (e.g. role creation always succeeds even if the LinkedIn/Naukri posts fail — see `roleController.createRole`). Follow this pattern for any new outbound integration rather than throwing/blocking on failure.

**Retention sweep** (`services/retentionService.js`): a daily cron (`node-cron`, registered in `server.js`, 2 AM) plus a manual `POST /api/retention/run` both call `runRetentionCleanup()`. It no-ops unless `RETENTION_ENABLED=true`; when enabled, `Rejected` candidates untouched for `RETENTION_DAYS` (default 180) are either anonymized (default, strips PII but keeps the record/history for reporting) or hard-deleted, per `RETENTION_MODE`.

**Uploads**: two separate Multer configs — `middleware/upload.js` (disk storage under `backend/uploads/resumes/`, PDF-only, 5MB) for resumes, and `middleware/uploadCSV.js` (in-memory, CSV-only, 10MB) for bulk import, parsed by `csv-parse` in `bulkController.js`. Resume parsing (`resumeController.js`) is explicitly a best-effort heuristic (regex + `utils/skillKeywords.js` keyword matching) to prefill a form — not a trustworthy extractor.

**Frontend** is plain CRA (no router library). `App.js`'s `Gate` component is the entire routing logic: unauthenticated → `AuthPage`, `role === 'candidate'` → `CandidateDashboard`, else → `RecruiterApp`. `RecruiterApp.js` is a tab switcher (`views` object keyed by tab id) rendering one of `Dashboard`, `CandidatePool`, `SkillSearch`, `AssessmentOutreach`, `CandidateForm` (recruiter variant with a manual/referral source picker via `allowManualSource`), `RolesCodes`, or `SlackGroups` — no nested routes. `auth/AuthContext.js` holds the JWT in `localStorage` (`ats_token`) and restores a session on load via `GET /api/auth/me`. `api/api.js` is the single fetch layer: every call goes through `request()`, which throws a real `Error` on network failure or non-2xx (check console `[API]` logs when debugging) — don't call `fetch` directly from components.

## Conventions worth matching

- `roleCode` is always upper-cased/trimmed at every write site (model schema, controllers) — treat it as the canonical role identifier, not `title`.
- Controller responses are always `{ success, message, data? }`; errors are `{ success: false, message }` with the real error only in `console.error`.
- Comments in this codebase are load-bearing — they document *why* (SRD references, intentional non-obvious tradeoffs like "auth not applied here on purpose", "hard delete, no undo"). Read them before changing behavior nearby, and preserve that density when adding similar logic.
