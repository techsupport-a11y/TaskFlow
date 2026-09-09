# TaskFlow — Product Requirements & Progress

## Original problem statement
Lightweight team task management for a small remote team (3–5 members) with two owners (Usman, Hena). Two access modes:
- **Team View (no login):** unique unguessable link `/team/{slug}` and/or PIN-picker fallback. Team members see only their own tasks; no financials, rates, admin, or reports.
- **Owner Admin View (login):** dashboard, kanban/list task board, approval queue, team management, finance/reports, audit trail. Owners approve or send back with feedback.
- **Auth choices:** JWT email/password AND Emergent-managed Google login (both enabled).
- **Deliverables:** URL only (no file uploads in v1).

**Palette:** white `#FFFFFF`, near-black `#0F0E0E`, primary green-black `#1B211A`, accent burgundy `#2D0000`; muted sage tints for status badges; red/amber only for Revision Required / overdue.

## Architecture
- FastAPI + Motor (MongoDB) backend, all routes prefixed `/api`.
- React (CRA/CRACO) frontend, React Router v6 nested routes.
- JWT owner sessions (Bearer token + httpOnly cookie).
- Server-side workflow validation:
  - Team side: `Assigned → In Progress`, `In Progress → Pending Approval`.
  - Owner side: `Pending Approval → Completed` OR `Pending Approval → Revision Required` (feedback required); `Revision Required → In Progress` when member restarts.
- Owner-only endpoints protected by `current_owner` dependency; public `/team/{slug}` returns tasks scoped to that member only, no PIN in response, no other members exposed.

## User personas
1. **Owner (Usman / Hena)** — assigns work, approves deliverables, manages team & finance, reviews audit.
2. **Team member (Mahnoor Senior, Areeba Junior, Zain Junior)** — opens private link/PIN, updates task status, submits deliverable URL, reads revision feedback, comments.

## What's implemented (Feb 2026)
- Public team view via `/team/{slug}` (stable seeded slugs: `mahnoor`, `areeba`, `zain`) or PIN picker (`POST /api/team/access`).
- Team board grouped by 5 statuses; task detail modal; start / submit-for-approval / comment.
- Owner login (email/password) with seeded owners; Google OAuth via Emergent-managed session.
- Owner Overview: stats, approval queue, activity feed.
- Owner Tasks: kanban + list toggle, create/edit/delete, approve/reject with feedback, assignee filter (v3).
- Owner Team: directory, add new member, **rotate access** (one-tap regenerate slug+PIN, immediate invalidation, v3), copy link.
- Owner Weekly Digest (v3): in-app preview page (totals + by-member table), optional Resend email delivery when `RESEND_API_KEY` is set.
- **Change password** modal (v3): owner-driven, requires current pw + min 8 chars.
- Owner Finance: completion rate, avg turnaround, payments, rates, budget note (owner-only).
- Owner Audit: full history of status changes with actor/from/to/note/timestamp.
- Mobile nav toggle exposes sidebar including logout on ≤600px.
- Backend privacy: `/team/members` omits `pin` + `slug`; `/team/{slug}` never returns other members or finance; all `/admin/*` require owner token.
- Testing: 30/30 backend pytest (iter1: 8, iter2: 11, iter3: 11), all target frontend flows verified.

## Prioritized backlog (post-MVP)
### P1
- Real payment CRUD (currently returns hardcoded demo finance data).
- Per-member reporting page (turnaround, completion rate, in-flight load).
- Deactivate/reactivate a team member; hide their picker option when inactive.
- Cron/scheduler to actually trigger Monday 09:00 UTC digest (currently manual send only).
- Audit-log rotate access events.

### P2
- Attachments beyond deliverable URL.
- Notifications (email/Slack) on assignment and status changes.
- Comments visible to owner in the task modal.
- Drag-and-drop kanban interactions.
- Multi-owner permission tiers if the team grows.

## Test credentials
See `/app/memory/test_credentials.md` (owners + team slugs/PINs).

## Key files
- `/app/backend/server.py` — FastAPI app, models, seed, all routes.
- `/app/frontend/src/App.js` — routes and views (Login, Team, TeamBoard, Shell, AdminHome, AdminTasks, AdminTeam, AdminFinance, AdminAudit, AuthCallback).
- `/app/frontend/src/index.css` — global styles + responsive rules.
- `/app/backend/tests/backend_test.py`, `/app/backend/tests/test_review_iter2.py` — automated coverage.
