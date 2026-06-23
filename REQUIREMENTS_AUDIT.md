# BuildTrack D&B Requirements Audit

Audit date: 2026-06-23

Legend:

- **Met** — usable UI and working local persistence/calculation flow exist.
- **Partial** — some data model or workflow exists, but the full requested module/output is not complete.
- **Missing** — no dedicated implementation yet.

## Core questions

| Requirement | Status | Current coverage |
| --- | --- | --- |
| Ahead or behind schedule | Met | Planned/actual progress, schedule variance, SPI, CPM dates and projection dashboards |
| Above or below budget | Met | Budget heads, actual/committed cost, CPI, forecast final cost and finance sensitivity model |
| Activity causing delay | Met | Critical/near-critical flags, activity variance and delay analysis |
| Projected completion date | Met | CPM forecast and projection dashboard |
| Evidence for payment, variation and claims | Partial | Document register, claim evidence checklist and notices exist; no generated claim/IPC dossier download |

## Requested modules

| Module | Status | Notes |
| --- | --- | --- |
| Project Setup | Met | Multi-project creation, contract amount/dates, solo/JV seed data, switching |
| Contract Control | Met | Dedicated obligation register covers clauses, notices, securities, insurance, approvals, reporting deadlines, evidence and compliance |
| WBS & Activity Schedule | Met | Activities, WBS codes, quantities, weights, resources and AI tender import |
| CPM Engine | Met | FS/SS/FF/SF, lag, early/late dates, float, critical and near-critical calculations |
| Design Management | Met | Packages, review due dates, comments, approval status and impact |
| Site Investigation | Partial | Represented through WBS/activity records; no dedicated survey/geotech/utility/site-possession register |
| Daily Progress | Met | Standalone daily reporting stores work, manpower, equipment, weather, materials, delays, instructions and site photos |
| Expected vs Actual | Met | Activity-level planned/actual and variance views |
| Forecasting | Met | Forecast completion, productivity and recovery calculations |
| Budget & Cost | Met | Contract, budget, actual, committed, forecast and package P/L |
| Daily Expenses | Met | Date-wise site expenses record category, WBS, vendor, payment method, voucher reference and approval status |
| Procurement | Met | Purchase orders, vendors, required/expected delivery, delivered quantities, commitments and late-delivery alerts |
| Subcontractor | Partial | Data and package costs exist, but no dedicated subcontractor progress/payment dashboard |
| QA/QC | Met | Inspections, tests, pass/fail, NCR and test details |
| EHS / Safety | Met | Incidents, near misses, toolbox talks, permits and environmental complaints |
| IPC / Billing | Met | Claimed, certified, paid, retention, advance recovery and VAT data model |
| Variations & Claims | Met | Event, notice, cost/time impact, evidence and status |
| Reports | Met | Daily, weekly lookahead, monthly, IPC, claims/EOT, QA/QC, safety and handover packs export as printable HTML, CSV and JSON |
| Handover | Met | As-built/O&M/test/warranty/training/final-account checklist structure |
| Defects Liability | Partial | Defect reporting and rectification workflow exists; retention release and defects liability certificate are missing |
| Finance Tracker | Met | Editable rows, collapsible groups, sparklines, cash curve and sensitivity |
| Document Register | Met | Contracts, securities, RFIs, notices, approvals, permits, variations and QA records |
| Supabase Quick Connect | Met | Runtime credentials, email/password and Google authentication, RLS schema, push/pull controls, automatic mutation sync and Storage photo uploads |

## Data architecture gaps

The current schema covers the major operational tables, but these requested entities still need implementation or expansion:

- contracts, employer requirements and JV partner contribution records
- role/permission policies backed by real authentication
- schedule versions and critical-path snapshots
- manpower/equipment/photo/delay-event tables
- procurement orders, stock, vendor payments and measurement books
- method statements, material approvals, calibration, PPE and waste records
- claim notices, EOT submissions, early warnings and downloadable evidence packs
- retention release, punch list and defects liability certificate

## Recommended next implementation sequence

1. Add a dedicated site-investigation register for surveys, geotechnical findings, utilities and possession.
2. Expand subcontractor controls into a dedicated progress, certification and payment dashboard.
3. Add retention release and defects liability certificate workflows.
