# BuildTrack D&B — Phase 0 product and codebase audit

Audit date: 24 September 2026. Repository: Aashutoshkashyap/ctms. Inspected commit: `f422ec7`.

Scope: read-only inspection of application source, API handlers, SQL scripts, configuration, seed script and existing documentation. This report is the only repository addition. No application changes, migrations, dependency installation, database operations, deployment or credential changes were performed.

Evidence boundary: “implemented” means an actual code/data path exists, not that every production workflow has passed acceptance testing. The deployed database policies, current credentials, OAuth grants, email delivery, bucket configuration and production environment were not inspected in this audit. Earlier July login demonstrations are historical evidence, not September verification. Visual, screen-reader and device assessments below are source-based; no current browser contrast measurement is claimed.

Checks run: `tsc --noEmit --incremental false` passed; `eslint src --quiet` passed. These establish type-check success and absence of ESLint errors, not behavioral correctness. No tracked test/spec suite or CI workflow was found. A production build was not run, because this phase is a read-only audit and build output is unnecessary to establish the findings.

Classification: **A Implemented**, **B Partially implemented**, **C UI only**, **D Backend only**, **E Inconsistent**, **F Missing**, **G Needs product decision**. Multiple labels may apply to different parts of one feature.

## 1. Executive summary

BuildTrack is a substantial working prototype with real Supabase integration, not merely a dashboard mockup. It includes project membership, scheduling calculations, daily reporting, resource logs, expenses, IPC claims/certification/payments, procurement, compliance evidence, handover, defects, subscriptions and Google integration. These capabilities should be strengthened incrementally rather than rewritten indiscriminately.

It is not yet demonstrably ready for unrestricted tenant onboarding. The highest priorities are authorization consistency, durable and truthful saves, project-scoped data integrity, safe report rendering, and one agreed definition of each financial/progress metric. Passing compilation and signing in do not prove these properties.

The intended Nepal-first experience is only partially present: BS input and display exist, but the product is predominantly English. Field employees receive fewer modules, but those modules still expose technical forms rather than an assigned-task workflow. Google files are created in the consenting user's Drive, but connections are per project, reconnection creates new folders, and the server can decrypt tokens. The current implementation supports routine platform/tenant separation; it does not establish cryptographic inability for the platform operator to access data.

Priority findings, grounded in source:

| Priority | Finding | Evidence and implication |
|---|---|---|
| P0 | Business Admin role escalation is possible under the checked-in membership policies | `supabase_final_product.sql:288`, `:336`, `:526`: organization Business Admins satisfy `can_manage_project`; the membership write policy only forbids `super_admin`. They can potentially update their project role to `project_director` directly. The feature-permission trigger only watches permission changes, not role escalation. The API's stricter restriction is bypassable through direct database access. Validate actual deployed policies before claiming tenant privacy. |
| P0 | BOQ import invokes destructive full-project synchronization | `src/app/page.tsx:470` → `src/lib/storage.ts:3060`. Sync deletes many operational tables and reconstructs them from local cache, sequentially, without a transaction. It also reconstructs other users with null auth IDs. Even the blank-schedule import guard does not establish an otherwise empty project. Failure can leave records deleted and relationships broken. |
| P1 | Background persistence can fail while the UI appears saved | `storage.ts:1319–1356`: pending keys are cleared before writes; database errors are logged, not propagated; no durable retry journal. A subsequent pull can overwrite unsaved local changes. |
| P1 | AI proxy lacks user, tenant and entitlement authorization | `src/app/api/ai/route.ts:6`: an API key and per-process IP counter are the only barriers. A configured server can incur AI usage from unauthenticated callers. |
| P1 | Report HTML interpolates unescaped project metadata | `ReportCenter.tsx:26`: project name, contract number and currency are inserted into HTML rendered with `dangerouslySetInnerHTML`. Table values are escaped, but the header is not. Malicious stored content can become executable markup. CSV cells also lack formula neutralization. |
| P1 | Google routes do not enforce Director feature overrides | `googleConnection.ts:40` selects role only; `google/upload/route.ts:34` checks a role list. A user denied upload access by a feature override can still satisfy the server's role check. |
| P1 | Read-only UI is primarily a CSS interaction block | `globals.css:329`; child components often inspect role without permission overrides. `pointer-events:none` is neither an authorization boundary nor a reliable keyboard disabled state, and also blocks legitimate filters/export buttons. RLS remains essential. |
| P1 | Cross-project relationships are not comprehensively constrained | For example, `ipc_payments.project_id` and `ipc_id` have independent FKs; daily work/dependency references likewise use globally keyed IDs. No matching composite FK is shown. A permitted child write can refer to a parent from another project. The security-definer IPC total trigger makes this especially important to test. |
| P1 | Financial summaries disagree | Director portfolio counts all non-rejected expenses; role dashboard counts approved expenses; EVM uses budget-head actual cost. EVM payment totals ignore partially paid IPCs. These are different definitions displayed as related control metrics. |

P0 denotes release-blocking source findings needing verification/remediation before broad onboarding; it does not assert that an exploit was executed against production.

## 2. Existing architecture

Next.js 16.2.9 App Router, React 19.2.4, TypeScript, Tailwind 4, Supabase JS and `nepali-date-converter`. The main application is one large client component in `src/app/page.tsx` (871 lines). Feature dashboards receive props/callbacks or read the singleton storage adapter directly. There is no central domain service layer, normalized query cache, transaction service, or durable client operation queue.

`src/lib/storage.ts` is 3,160 lines and combines interfaces, demo data, identity, membership, local persistence, cloud synchronization, files and domain operations. Separate CPM/EVM modules are useful existing seams. Server integration utilities already separate Google, platform authorization, email and security helpers.

Routing:

| Surface | Existing routes |
|---|---|
| Application | `/` — login, onboarding, all project panels and platform console through client state |
| Public/account pages | `/reset-password`, `/privacy`, `/terms`, `/google-verification` |
| Authentication/user administration | `/api/auth/local`, `/api/admin/users` |
| Platform | `/api/platform/overview`, `/api/platform/payment-proof`, `/api/platform/email`, `/api/contact` |
| Subscription/operations | `/api/subscription/status`, `/api/cron/subscription-alerts`, `/api/cron/keepalive` |
| Google | `/api/google/connect`, `/callback`, `/status`, `/disconnect`, `/upload`, `/gmail/send` |
| AI | `/api/ai` |

Feature tabs do not have independent project URLs. Refresh, browser history, deep links and notification destinations cannot reliably identify a feature/record. Feature components are statically imported into the client shell; no feature-level lazy-loading boundary is defined there. Public legal pages are actual routes.

## 3. Existing feature map

| Capability | Status | Actual implementation and limitation |
|---|---|---|
| Tenant/project setup | A/B | Organizations, memberships, projects, quota triggers, onboarding API; organizational hierarchy is shallow. |
| Director portfolio | A/E | Multi-project progress, expenses, delays, archives; cost/progress definitions differ from EVM and other dashboards. Portfolio alert input is derived from the active project. |
| Tender intake | B | Text-to-WBS/activity generation, model request and heuristic fallback in `ai.ts`; not a tender opportunity/bid evaluation/award workflow. |
| BOQ/WBS/work programme | A/B/E | WBS hierarchy, activity quantities, Gantt, manual entry, FS/SS/FF/SF, lag/lead and critical-path calculations. BOQ commercial items and scheduled activities are not fully separate entities. Import persistence is unsafe. |
| Design control | A, hidden UI | Component, records and operations exist; menu entry removed. Do not classify it as absent or delete it without dependency review. |
| Daily site reporting | A/B | Dated records, multiple work/material entries, quantities/rework, edit/delete, photo upload and filters. Technical form and local-first save path remain concerns. |
| Equipment/labour/fuel | A/B | Resource logs, crew names, machinery days, meters, quantities and ratios. No complete fleet/crew master or allocation ledger; aggregating unlike work units produces misleading efficiency values. |
| Employee profiles/visits | B | Employee ID, email, rate, trade, site and assignment text; planned/on-site visits. Not an effective-dated employment/transfer/task system. |
| Expenses/payment slips | A/B | Employee/date filters, status, activity link, evidence upload and cost summaries. Approval/state integrity and authoritative accounting are incomplete. |
| IPC and receipts | A/B | Claim files, certificate files, partial-payment rows, receipt evidence and SQL total trigger. Not a certified measurement-book-to-IPC line ledger. |
| Variation/claim/EOT | B | Notice/reference, quantity/rates, money/time impact, status and risk records. No formal entitlement assessment, approval stages, contractual notice engine or EOT decision entity. |
| Procurement/inventory | A/B | Orders/status/dates, vendor text, stock balances, inventory events and editing. No normalized vendor catalogue or transactional receipt/issue/transfer ledger. |
| Contract obligations | A/B | Obligation register, dates, parties, remarks and contract reference. Not a versioned contract/party/obligation state machine. |
| QA/QC/RFI/NCR | A/B/E | Inspections, sample/test fields, NCR status and evidence. “RFI” also means Request for Information in document categories: terminology needs separation. |
| Safety/EHS | A/B | Incident/talk/permit counters and compliance upload. Not a detailed investigation, corrective-action and permit workflow. |
| Compliance/documents | A/B | Required evidence categories, links to other records, register editing and file upload. Version text is not immutable version history; document approval is not a server-enforced transition model. |
| Handover | A/B | Director/PM/QA create deliverables, assign party/due date and complete with evidence. No contract templates or independent multi-party acceptance process. |
| Defects | A/B/E | Report, assign, rectify, verify and attach evidence. Site role is allowed in component copy/logic but lacks `defects` navigation permission. |
| Reports | A/B/E | HTML/CSV/JSON from current client records. No date-range reporting engine; “two-week” report selects eight unfinished activities, not a real two-week window. No native signed PDF/XLSX output. |
| Upload feedback | A/B | Overlay plus ref-based duplicate-submit locks; preserve. No durable idempotency, resumable transfer, true byte progress or guaranteed cloud persistence. |
| Subscriptions/platform billing | A/B | Onboard, plans-as-fields, transaction review, validity extension, proof storage and queued renewal emails. No versioned pricing catalogue or transactional renewal ledger. |
| Tenant Gmail sending | D/B | Authenticated server endpoint behind an environment flag; no complete tenant email workflow UI was found. |
| Removed Finance/AI/Projection panels | Implemented source, hidden UI | `FinanceTracker`, `AiAssistant`, `ProjectionDashboard`, `SubscriptionNoticeBanner` remain in source; they are not current shell navigation items. AI tender use remains reachable. |
| Onboarding questionnaire | C/B | Captures function/company size/timeframe and maps proposed role metadata; membership still requires provisioning. Questionnaire does not implement the organization lifecycle. |
| WhatsApp | F | No webhook, verified sender mapping, message inbox, media ingest or delivery handler found. |

Do not rewrite the CPM/EVM engines, BS converter/picker, upload locking, IPC payment history/trigger, existing domain registers or platform/tenant separation from scratch. Preserve behavior with characterization tests before changing their boundaries. Preservation does not mean retaining the identified calculation or security defects.

## 4. Existing role/permission map

Source of UI defaults: `src/lib/permissions.ts:4–169`. Permissions are `none/read/write`, overridden per project membership. Director bypasses feature restrictions. Other roles cannot acquire a feature absent from their default list: `can()` returns false before applying overrides when the baseline is `none`.

| Role | Current default experience |
|---|---|
| Superadmin | Separate platform console; no default project features |
| Business Admin | Procurement, obligations, documents, reports, subscriptions, settings and user/project management |
| Project Director | All features and portfolio |
| Project Manager | Broad delivery/commercial/quality/operations modules; no default settings/users |
| Planning Engineer | Schedule, daily reports, resources, reports, AI/forecast permissions |
| Site Engineer | Schedule, daily reports, resources, visits, quality, safety, expenses and uploads |
| QS/Billing | Budget, IPC, claims, expenses, reports, documents and expense approval |
| Accountant | Budget, IPC, expenses, reports, approval and uploads |
| Store Officer | Resources, procurement, expenses, documents and uploads |
| Design Coordinator | Schedule, design, documents, daily reports and uploads |
| QA/QC | Daily/resources/quality/documents/handover/defects and uploads |
| Safety Officer | Daily/resources/visits/safety/documents and uploads |
| Subcontractor | Schedule, daily reporting, resources and uploads |
| JV Partner | Read-only executive/schedule/forecast/reports defaults |
| Employer Viewer | Read-only executive/schedule/forecast/reports/handover defaults |
| Field Employee | Daily reports, resources, expenses and uploads; no dedicated assigned-task home |

Membership uses `project_users` linked to Supabase auth IDs and project IDs; one account can have memberships in several projects. `organization_members` adds organization leaders but is not a full staff/department tree. The tenant-seat trigger rejects a user already belonging to another tenant, which conflicts with a potential consultant participating across independent businesses: this is a product decision, not automatically a defect.

Authorization is duplicated across TypeScript defaults, component role arrays, server route checks, permissive SQL policies and restrictive feature gates. Examples of mismatches:

- Site Engineer has UI schedule/quality/safety write defaults, while corresponding base SQL write policies exclude that role in those areas.
- PM can see broad editable budget capabilities while base financial writes exclude PM; the later IPC migration permits claim insertion specifically, not all financial updates.
- Business Admin bypasses the restrictive feature helper, so its semantics differ from ordinary users.
- Missing feature keys mean “use baseline” in UI but “allow this restrictive gate” in SQL. Broad base SELECT policies therefore remain broader than hidden navigation for legacy `{}` memberships.
- Google upload checks roles without feature permissions; staff cannot obtain extra modules through a Director override beyond their role baseline.

## 5. Existing tenant/security model

Projects carry `organization_id`; most operational records carry `project_id`, with tenant ownership inferred through projects. `supabase_final_product.sql` provides active-subscription checks, platform-admin exclusion from project helpers, project and seat quotas, membership ownership and private storage buckets. Restrictive feature gates are added by `supabase_client_onboarding_upgrade.sql`; SQL application order is material.

The documented install chain is final-product SQL → controls/subscription upgrade → client-onboarding upgrade. Older standalone schema/role/B2B scripts coexist and define overlapping helpers/policies. A repository review cannot prove which policy versions production currently uses; obtain a schema/policy export for verification before rollout. Do not re-run older scripts speculatively.

Supabase password auth and verified session lookup are real. Password recovery uses Supabase email recovery and an update-password page. The recovery page accepts any valid existing session, rather than distinguishing a recovery event. Actual email delivery, redirects, confirmation policy and session revocation require a separate acceptance test. Signup accepts eight-character passwords while provisioning/reset require ten with character classes. No forced temporary-password-change workflow is evident.

The local demo path uses signed HttpOnly cookies and is normally disabled in production unless hashes are configured. However, known demo emails fall back to it after any cloud-login error, not only an outage. Platform authorization also accepts a verified demo superadmin cookie mapped to a platform-admin row. Demo access is therefore a real authorization mode, not merely a cosmetic preview. Existing simple demo credentials from the conversation were not retested or changed.

Server service-role access deliberately bypasses RLS. Platform overview restricts its selected response fields to tenant/subscription/contact metadata; this is a useful boundary. The same server nevertheless holds database and Google-decryption capability. No explicit, time-limited, tenant-approved support-access mechanism or immutable access log exists. Do not promise “the platform cannot access tenant data” based solely on a hidden superadmin menu.

Other risks: per-process rate counters do not create shared production quotas; trusted-client financial approval fields are not comprehensively protected by transitions/column rules; notification actors are client strings; private uploads lack a visible malware scanning/quarantine pipeline. `.env*` and `.vercel` are ignored, and server keys are referenced server-side. This review is not a historical secret scan or proof that credentials previously pasted in chat were rotated.

## 6. Existing data-flow map

```text
Supabase password/OAuth session
  → membership lookup / active project / project role
  → bootstrap: projects + memberships + finance + ~30 domain table queries
  → global bt_* LocalStorage cache
  → shell state / independently cached component state
  → user edits → local array replacement → immediate UI refresh
  → 500 ms pending-key batch → authenticated Supabase upserts → RLS
  → focus / online / 60-second active-project pull → cache replacement
```

This is local-first optimistic persistence, not a robust offline synchronization protocol. No persistent outbox, record version, conflict policy, mutation ID, tombstone or durable acknowledgement is present. Upserts generally send the active project's full local collection for a changed key. The queued key is not bound to the project at edit time: switching projects before the timer fires can cause the old project write to be skipped. Pulls do not reconcile unacknowledged mutations.

Bootstrap eagerly reads tables irrespective of which modules are visible. Some table failures leave prior cache intact but the overall pull still records a last-sync timestamp and reports success. LocalStorage is cleared at sign-out/login, which is useful, but global cache keys are not tenant/user namespaces. Components initialized with `useState(storage.get...)` do not necessarily react to later cloud pulls. Project keys force remounts for several modules, correctly reducing cross-project stale state, but same-project background updates can still be stale.

Deletes are mixed: explicit database deletes exist for reports/dependencies/projects, while collection-upsert synchronization has no general deletion protocol. The full-replacement sync is reachable from tender import and should not be used as a general repair tool.

## 7. Existing Google Drive flow

```text
Director project settings → authenticated connect POST
  → signed, expiring OAuth state → Google consent
  → callback rechecks user/project/subscription
  → tenant-named root / Projects / project / category folders + workbook
  → encrypted refresh token and folder IDs in google_connections
Staff upload → role-authorized server endpoint → token refresh
  → file in consenting user's Drive → optional Sheets append
  → Drive file reference cached/synchronized in project records
```

Strengths: tokens use AES-GCM encryption; callbacks verify signed expiry and reauthorize membership; file creation uses the consenting Google account, not a platform-owned Drive account. Workspace and platform Gmail connections have separate flows. Files are named with date, employee, BOQ/reference and remarks.

Limitations:

- `google_connections` is looked up by project ID, not one tenant-wide connection reused across all projects. Every connection/reconnection creates another root/tree/workbook without searching for existing folders.
- Ownership is the consenting individual's Google account; company ownership, Shared Drive use, staff departure and transfer policy are undecided.
- The server decrypts the tenant token. Platform routine access can be restricted, but stronger operator-inaccessibility needs an explicitly different trust model.
- Plain text expenses/employees are not universally replicated as structured business records in Sheets. The append path is attached to uploads and contains file metadata; append errors are swallowed.
- Sheets writes use `USER_ENTERED` for user-derived values, allowing formula interpretation. OAuth state has a nonce but no consumed-state store/browser binding was found.
- File upload fallback silently moves from failed Drive to Supabase, then sometimes local data URLs. Storage residency is not a tenant-enforced guarantee. No durable retry/migration process moves local files to cloud later.
- A returned Drive web link relies on Google's permissions. The application does not establish a complete Drive-sharing/read-proxy model for all project roles.
- Supabase remains the business-record database; Drive is not presently a replacement database.

## 8. Existing BS date flow

`BsDatePicker` accepts an ISO AD date, converts it to BS for the calendar, and emits ISO AD after selection. `nepaliDate.ts` provides Nepali digits/months, conversion, validation and display. This is a sound boundary worth preserving: business-facing BS does not require storing ambiguous BS text in SQL date columns.

Gaps: no UI language preference exists, so independence from English/Nepali switching is not yet tested. Fallback parsing bounds BS years to 2000–2099; picker fallback year is 2083. Date-only “today” logic is duplicated between local browser time, UTC and Kathmandu time. `formatBsDateTime` formats the time in Kathmandu but extracts the date from the original timestamp prefix; near midnight its date and time can disagree. Subscription logic also mixes database `current_date`, UTC and Kathmandu. Invalid conversion returns the original AD string, silently weakening the BS-only display promise. The unused/legacy CPM formatter still formats AD English dates; distinguish helper presence from actual visible usage.

## 9. Existing subscription flow

Superadmin onboarding creates an organization, auth account, organization membership, first project and project membership through server APIs. Organization fields hold plan/status/access date/seat limit/project limit. Payment transactions have status, proof, amount, period, reference and verification metadata. Verification updates tenant validity and project access dates, adds a tenant notice and queues a platform email. The tenant Service & Billing panel reads `/api/subscription/status`.

Vercel configuration declares daily keepalive and subscription-alert jobs. The alert handler requires `CRON_SECRET`, evaluates T-5/T-3/T-1/T, creates deduplicated notices/deliveries, and invokes a Gmail delivery queue with retry counts. These are real backend paths, not merely labels.

Remaining gaps: multi-step payment verification/extension is not one transaction; repeated review/refund behavior needs defined entitlement semantics; expiry-day schedules have no catch-up window if a day is missed; queue workers have no atomic claim/lease preventing concurrent sends. Queue retry does not reassess whether a previously queued expiry message became stale after renewal. Pricing is a plan field, not a versioned plan/price catalogue. Subscription status API returns transaction history to any verified tenant member, although UI exposes it more narrowly. Whether ordinary staff should see billing amounts is a product decision requiring server enforcement. SQL/Vercel cron definition does not prove jobs run or Gmail is configured in production.

The checked-in demo seeder writes `access_until: 2026-08-11`, already past on this audit date. Running it now can overwrite a later manual extension and expire the demo. No seed was run.

## 10. Existing mobile/UX assessment

Positive foundations: hamburger navigation, project switcher, responsive grids, table scroll containers, light shell, larger global input styles, upload overlays and role-filtered navigation. Budget columns have sticky positioning. Several project-specific components remount on project change.

Problems: a single large technical navigation structure remains; role home pages mainly filter cards and metrics. Field users still enter activity/resource/fuel/manpower/material details across multiple forms instead of following today's assigned tasks. Site reporting begins with numerous fields and zero defaults. Stock/resource/person/party names are often text rather than reusable master records. There is no progressive “simple / detailed” entry model.

Dense tables require horizontal scrolling; sticky cost columns can consume a narrow viewport. The main area uses constrained viewport heights and nested scrolling. `overflow-x:hidden` can conceal layout overflow rather than solve it. Mobile drawer code does not establish a full keyboard focus/inert-background dialog pattern. Actual device behavior remains unmeasured in this audit.

Low-bandwidth concerns: eager multi-table reads, collection-wide upserts, fixed polling, static feature imports, unbounded local arrays and base64 file fallbacks. There is no image-resize pipeline, resumable upload or offline application shell. No WhatsApp/voice-first capture flow exists.

## 11. Existing localization assessment

Status: F for Nepali-first application language; B for Nepali calendar presentation. English strings are embedded in page/component JSX, permission labels, form errors, API messages, seed data, reports and email templates. No locale catalog, translation provider, language switch or persisted language setting was found. `layout.tsx` declares `lang="en"`; imported font subsets are Latin.

Target: Nepali as default locale with reviewed construction vocabulary, English as a second UI language, calendar setting independent and fixed to BS for business use. Store stable enum/codes, translate labels, and separate user-entered text from translated product copy. Keep original contract wording and support bilingual exports where needed. Do not translate stored role keys or convert BS display back to AD when switching language.

## 12. Existing accessibility assessment

There are useful focus outlines, native inputs, some labels/ARIA names, required validation and an announced upload status. However, several forms use adjacent visual labels without `htmlFor`/input IDs, dialogs lack consistent roles/focus trapping/Escape behavior, and calendar keyboard-grid behavior is incomplete. Tiny labels remain even after global font increases. Emoji icons and status colors need textual accessible meaning.

The global light conversion rewrites utility colors with `!important` while components retain dark utility classes. Hover, active and disabled combinations can escape those patches. No measured WCAG pass is claimed. Reduced-motion handling was not found for animated overlays. CSS-only read access blocks filters and does not prevent keyboard activation reliably. Inspect at 200% zoom, with keyboard/screen reader and a Nepali font before acceptance.

## 13. Existing technical debt

Large responsibility clusters: `storage.ts` 3,160 lines; shell 871; `ai.ts` 740; schedule component 525. Conversely, 45–64-line report/handover/defect components contain long compressed lines: line count understates complexity.

Repeated logic includes date/today helpers, permission arrays, cloud table mappings, environment/admin-client initialization, ID generation, upload/error paths and dashboard financial calculations. Extensive `any`, handwritten SQL/interfaces and string-based IDs weaken schema-change feedback. No generated database types or behavior regression suite was found.

CSS is an adaptation layer over old dark styles, not a coherent component system. Removed components and obsolete permission names remain, making product scope harder to interpret. Static demo defaults remain in the production client storage module and can surface when caches are absent or pulls fail. Existing README/audit documents describe intended coverage more confidently than these source findings justify.

## 14. Product gaps against the intended vision

The lifecycle exists as loosely related registers rather than a continuous contract process. Missing dedicated entities include tender/bid/award, versioned contracts and parties, mobilization milestones, BOQ versions/rate breakdowns, measurement books/certifications, IPC lines, EOT applications/decisions, retention/guarantee release and formal completion acceptance.

JV support is partial: `jv_status`, lead/other partners and a read-only role exist. No JV entity, share/responsibility allocation, delegated authority, partner membership or inter-company commercial model exists. Organization hierarchy lacks branches/departments/reporting managers/effective dates. Employee assignment is mostly text; visits exist but assignment/transfer history and task responsibility are not a coherent model. Daily rate does not constitute payroll: pay periods, attendance reconciliation, wages/overtime/advances/deductions/payslips/approval are missing.

Audit-objective coverage index:

| Objectives | Classification and location in this report |
|---|---|
| 1–4 architecture/routing/components/state | A/E — §§2,6,13 |
| 5–9 Supabase/access/auth/authz/RLS | A/B/E — §§4–6 |
| 10 tenant isolation | B/E — §5; release-blocking policy verification required |
| 11–13 roles/membership/features | A/B/E/G — §4 |
| 14 Drive | B/E/G — §7 |
| 15 BS | A/B/E — §8 |
| 16 subscriptions | A/B/E — §9 |
| 17 responsive/mobile | B — §10 |
| 18 localization | F/B — §11 |
| 19 accessibility | B/E — §12 |
| 20 UX inconsistencies | E — §§10–12 |
| 21–22 duplicate logic/oversized components | E — §13 |
| 23–24 hard-coded labels/English | E/F localization — §11 |
| 25 dark/light | E — §§10,12 |
| 26–28 navigation/forms/mobile usability | B/E — §§10,16,17 |
| 29 low bandwidth | B/F durable support — §§6,10 |
| 30 security | E — §§1,5,7,21 |
| 31 data model | B/E — §§5,14 |
| 32 missing domain entities | F/B — §14 |
| 33 JV | B/G — §14 |
| 34 organization hierarchy | B/F — §14 |
| 35 employee assignment/movement | B — §§3,14 |
| 36 payroll/HR | F for payroll, B profiles — §14 |
| 37 WhatsApp architecture | F — §§3,20 |
| 38 offline/sync | B/E — §6 |
| 39 notifications | B/E — §§6,9 and below |
| 40 audit trail | F for immutable audit, B event records — below |

Project notifications are synthesized in the browser for a subset of local-storage keys and capped at 200 cached records. They are mutable and use a shared `read` boolean rather than per-recipient receipts. They omit some workflows and are not an authoritative event stream. Inventory events and subscription delivery logs are useful partial history, but not a tamper-resistant actor/before/after/reason trail. Server-side events, user-targeted inboxes and immutable audit records remain necessary.

## 15. Recommended target architecture

Retain Next.js and Supabase initially; a modular monolith is sufficient. Separate the platform control plane from tenant project operations in routes, authorization services, types and data contracts. Platform endpoints should return explicit metadata DTOs; tenant services should require a verified principal, tenant, membership, project and capability on each operation.

Introduce domain boundaries gradually: identity/organizations; contracts/parties; BOQ/programme; field execution/measurement; commercial/IPC/payments; resources/inventory; quality/safety; documents/completion; billing/notifications. Keep calculations pure. Use generated database types and validated mutation payloads. Define one permission policy contract with parity checks against RLS, not multiple independent lists.

Use transaction-backed business commands for financial/approval changes, quotas and destructive lifecycle operations. Enforce same-project parent/child relationships. Add immutable audit events and a transactional outbox for notifications/files/integrations. Replace full-project delete/reinsert with incremental, acknowledged changes. Add indexed, bounded queries and project-specific caching before adopting more infrastructure.

Offline: tenant/user/project-scoped IndexedDB cache plus durable outbox, operation IDs, record versions, conflict handling, attachment state, visible pending/failed indicators and retry. Separate “saved on this device” from “synced to business.” Never silently substitute demo data for unavailable production records.

Drive: one tenant-owned connection with per-project folder mapping, reconnect reuse, encrypted token rotation strategy, explicit storage-provider policy and upload jobs with retry/reconciliation. Decide company-account/Shared-Drive ownership and whether operator-access prevention is procedural or cryptographic before making guarantees.

## 16. Recommended target UX architecture

One Nepali-first design system: semantic colors, legible typography, accessible controls, reusable form/error/loading patterns and BS date fields. Keep technical IDs hidden unless they help the user. Rename concepts through translation labels, preserving stable backend identifiers.

Make home screens task-oriented. Director sees portfolio exceptions and decisions; PM sees coordination and today's delivery; Site Engineer sees plan/work/resources/problems/tomorrow; Accountant sees approvals/payments/expenses; field employee sees assigned work and a short update composer. Reuse the same underlying records in simple and detailed views.

Use progressive disclosure and prefilled context: project/site/person/date → choose work → quantity/photo/text → review → save. Show sync status for the particular record. Do not force all employees through register-sized forms. Make long tables an expert desktop view with mobile record cards or focused column sets.

## 17. Recommended navigation model by role

| Persona | Primary navigation |
|---|---|
| Platform Superadmin | Businesses; plans/subscriptions; payments; onboarding/contact inbox; platform notices; usage/access metadata |
| Business Admin | People; project setup; access; company records; service billing — sensitive operational scopes separately decided |
| MD/Director | Overview; approvals; projects; money due/spent; people/resources; alerts; reports |
| Project Manager | Today; work plan; site updates; resources; approvals/issues; contract actions; reports |
| Site Engineer | Today's work; report work; materials; labour/equipment; inspections/problems; photos |
| Accountant/QS | Expenses; approvals; measurements/IPC; receipts/payments; claims where permitted; exports |
| Field Employee | My tasks; add update; my submissions — photo/text/quantity, later voice/WhatsApp |
| Store Officer | Receive; issue; stock; vendors/orders; plant/fuel |
| QA/Safety/Design | Assigned reviews/inspections; discipline register; evidence; outstanding actions |
| Consultant/employer/JV | Project-scoped submissions, review/approval or read views defined by contract authority |

Provide shareable `/projects/:id/...` record URLs and a tenant switch only if multi-business membership is explicitly supported. Feature visibility follows responsibility and permission, not technical literacy inferred from role alone.

## 18. Recommended Phase 1 — stabilize boundaries and persistence

Obtain a read-only deployed schema/RLS/bucket/config inventory and compare it with the documented SQL chain. Capture a restore point before any later approved mutation. Build isolated fixtures for two tenants and all supported roles.

Then, in an explicitly authorized implementation phase, close membership escalation, AI authorization, report injection and cross-project relationship gaps; unify server/SQL feature enforcement; remove destructive import persistence; implement acknowledged incremental saves and clear failure states. Reconcile partial IPC payments and financial metric definitions. Keep demo fixtures isolated and prevent stale seed expiry values from overwriting live tenant settings.

Exit criteria: automated positive/negative tenant/role tests, denied-action tests through direct APIs, failure/retry/project-switch/concurrent-edit tests, no cloud-success message before acknowledgement, no project-wide destructive sync for BOQ import, and evidence that server-only secrets stay server-side. Run a controlled pilot only after these gates pass. Do not add broad new modules during this phase.

## 19. Recommended Phase 2 — Nepal-first workflows and mobile pilot

Create reviewed Nepali/English catalogs and independent BS presentation; consolidate date/time-zone rules; introduce accessible semantic UI components. Build simple employee and site-reporting flows, role-specific navigation, record URLs and reliable attachment handling. Establish company people/party/vendor/equipment masters and project assignments. Add audited approvals and measurement-to-IPC linkage incrementally.

Exit criteria: same business dates in both languages; practical phone/keyboard/screen-reader testing; interrupted connection and upload recovery; pilot users complete common field tasks without technical guidance; one expense and progress definition across reports/dashboards; no lost work after reconnect.

## 20. Recommended Phase 3 — contract lifecycle and integrations

Extend contract/JV/party governance, certified measurements, variations/EOT, completion and defects; add payroll only after attendance/pay rules are specified. Upgrade tenant-owned Drive integration and notification delivery with queued, auditable operations. Add WhatsApp through signed webhook verification, tenant-linked sender consent, deduplication, attachment scanning, draft review and delivery status. Messages should create traceable drafts before becoming certified commercial records.

Introduce plan versions, usage metering and entitlement-safe transaction history; operational dashboards, restore drills and support-access approvals. Scale query/upload/event paths based on measured load. Exit criteria include tenant onboarding without manual database repair, reliable integration replay, and verified access/ownership retention when employees leave.

## 21. Risks and product decisions

Release risks: policy drift; privilege escalation; silent data loss; partially applied bulk changes; stale role/cache state; inconsistent cost/payment totals; report injection; unbounded paid AI use; upload fallback/residency ambiguity; operator access to tokens; and lack of behavioral regression coverage.

Decisions needed before implementation: whether MD is an organization role distinct from project director; whether external consultants may belong to multiple tenants; JV ownership/access; who can see subscription amounts; who may certify/approve versus merely enter data; employee-visible expense scope; Drive company ownership; offline retention on shared phones; post-expiry read/export access; Nepali terminology; and Nepal-specific contract/tax/payroll rules. These require product/domain validation, not assumptions from labels or dashboard screenshots.

All external regulatory and service-plan statements should be verified against current authoritative sources during implementation. This audit makes no legal compliance certification or claim that a keepalive guarantees database availability.

## 22. Files that should not change without explicit approval

These are protected change surfaces for the next phase, not a suggestion to edit them now:

- All six `supabase_*.sql` scripts: schema, policies, triggers, identity and tenant isolation; require migration/rollback review and deployed-state comparison.
- `src/lib/permissions.ts`, `src/lib/server/security.ts`, `src/lib/server/platformAdmin.ts`, `src/app/api/auth/local/route.ts`, `src/app/api/admin/users/route.ts`, auth/reset portions of `storage.ts`: authentication and authorization.
- `src/lib/storage.ts`, especially seeding, cache resets, project deletion, membership and `syncActiveProjectToCloud`: cross-module persistence and potential destructive effects.
- `src/lib/server/googleWorkspace.ts`, `googleConnection.ts`, all Google routes: token security, ownership and provider access; key rotation invalidates connections.
- Platform/subscription/cron routes, `subscriptionEmail.ts`, `vercel.json`: tenant entitlement, billing and external email side effects.
- `next.config.ts`, `.gitignore`, deployment configuration and any environment/key values: security and hosting behavior.
- `scripts/seed-demo-data.mjs`: writes operational/auth-linked fixtures and subscription dates using privileged access.
- `src/lib/cpm.ts`, `evm.ts`, `nepaliDate.ts`, `BsDatePicker.tsx`: business calculations/calendar semantics; require characterization and boundary tests.
- `src/app/page.tsx`, `globals.css`, public privacy/terms pages: broad UX behavior and product promises; scoped review required before redesign or policy wording changes.

## PHASE 0 VERDICT

**Proceed to a scoped Phase 1 stabilization effort. Do not declare the product fully ready for unrestricted client onboarding.**

Preserve the existing implementation and its useful domain coverage. Correct authorization and persistence first, verify the deployed database rather than assuming checked-in SQL equals production, then introduce the Nepali-first mobile experience. The requested platform hierarchy, routine tenant privacy, durable offline support and full construction lifecycle are only partially satisfied today.

Phase 0 is complete as a repository-based audit. Production-policy inspection, end-to-end acceptance, live OAuth/email checks and measured device/accessibility testing remain explicitly unverified. No code or database changes were made.
