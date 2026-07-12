# BuildTrack D&B Requirements Audit

Audit date: 2026-07-12

## Release status

| Area | Status | Verified coverage |
| --- | --- | --- |
| B2B tenancy | Met | Every cloud project and user membership is linked to a business tenant; RLS prevents cross-tenant access |
| Platform Superadmin privacy | Met | Subscription/contact/payment metadata only; live RLS returns zero tenant projects, activities, expenses, photos, and Google connections |
| Subscription controls | Met | Trial/active/past-due access window, suspension/cancellation, expiry, employee-seat quota, and active-project quota enforced in database triggers/RLS |
| Role dashboards | Met | Separate Superadmin, Business Admin, Director, management, engineering, finance, site, safety, quality, stores, employer, subcontractor, and field employee access |
| Director portfolio | Met | All projects, progress, budget spent, delay count/remarks, archived projects, notifications, employee visits, archive/restore/delete |
| Multi-project synchronization | Met | Authorized projects and records load from Supabase, refresh after writes/focus/online, and switch roles by project membership |
| WBS / CPM | Met | Manual activities, editable rows, BOQ item/Description of Work labels, FS/SS/FF/SF, lag/lead, float, critical path, light Gantt, delay remarks |
| AI tender WBS | Met | Tender/BOQ scope can generate WBS and CPM activity data through the AI panel |
| Daily reporting | Met | Mobile table, date filter, edit/delete ownership, work and rework quantity, materials/vendors, people, equipment, delays, instructions, private images |
| Finance and expenses | Met | Employee/date filters, accumulated costs, BOQ linkage, approvals, payment slips, finance tracker, dashboard synchronization |
| Equipment/productivity | Met | Daily machinery, manpower, fuel/work comparison, excavator efficiency/mileage, crew/resource lists, and employee site visits |
| Procurement/inventory | Met | Vendors, location, order/delivery dates, remarks, status updates, store items, issues/receipts/moves, and inventory event history |
| Contracts/claims/quality | Met | Obligations, notices, variation quantities/rates/differences, inspection/test dates, NCR codes, QA/QC, EHS, IPCs, and claims |
| Documents/reports/handover | Met | General uploads, document registry, live report/export center, handover checklist, and defects workflow |
| Image/payment storage | Met | Private Supabase buckets and RLS tested with a real upload/read denial/read approval/cleanup cycle |
| Google tenant storage | Implemented; external approval pending | Signed OAuth state, encrypted project-scoped refresh token, server-only token access, Drive folders/Sheets, authenticated uploads; public Google OAuth still requires consent-screen publication/verification |
| Responsive light UI | Met | Mobile hamburger, 390 px no page overflow, scrollable tables, light inputs/text, larger dense-UI typography |
| Security baseline | Met | Supabase Auth/RLS, signed HttpOnly fallback sessions, login throttling, cache isolation on sign-out, CSP/HSTS/frame/MIME/referrer/permission headers, private env variables |

## Remaining production operations

These are deployment/operations tasks rather than missing application modules:

1. Publish and complete Google OAuth verification for the production domain and Drive/Sheets scopes.
2. Rotate the Google OAuth client secret that was previously shared in chat, then update Vercel.
3. Configure Supabase automated backups/PITR appropriate to the paid plan and retention policy.
4. Add centralized production error monitoring and an automated browser regression suite before a broad customer launch.
5. Connect a real payment gateway if subscriptions should be charged automatically; the current console supports manual transaction verification.

## Optional domain expansions

- Dedicated survey/geotechnical/utility/site-possession register
- Expanded subcontractor certification/payment workspace
- Retention-release certificate and final defects-liability certificate
- Native Bikram Sambat date picker (the current UI displays Nepali date labels alongside ISO dates)
