# BuildTrack D&B Project Control System

BuildTrack D&B is a multi-tenant construction project-control SaaS built with Next.js 16, Tailwind CSS, Supabase Auth/Postgres/Storage, and optional Google Drive integration.

## Product coverage

- Role-specific dashboards for Platform Superadmin, Business Admin, Director, project controls, site, finance, quality, safety, stores, employer, subcontractor, and field employees
- Director-only all-project portfolio with progress, cost, delays, archives, employee movement, notifications, and project lifecycle actions
- Multi-project WBS/CPM scheduling, manual activity entry, editable Gantt records, delay remarks, and AI tender-to-WBS generation
- Daily mobile site reports with work quantities, rework, people, equipment, materials, vendors, delays, and private verification photos
- Daily expenses by employee/date with approvals, accumulated cost, BOQ linkage, and private payment slips
- Procurement, inventory/stores, vendors, deliveries, equipment/fuel/productivity, QA/QC/NCR, safety, IPCs, variations/claims, obligations, documents, handover, and defects
- Printable HTML, CSV, and JSON report packs based on synchronized records
- B2B onboarding, subscription periods, seat/project limits, contact requests, and transaction verification
- Tenant-isolated Supabase RLS. Platform Superadmins can access subscription metadata but not tenant projects, employees, expenses, documents, or images

## Local development

Use Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Release checks:

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## Supabase setup

1. Create a Supabase project and enable Email authentication.
2. Run `supabase_final_product.sql` in the Supabase SQL Editor. It is the authoritative, idempotent migration and creates tenant metadata, operational upgrades, RLS policies, and the private `site-photos`, `project-documents`, and `payment-slips` buckets.
3. Configure server-managed environment variables; do not paste database keys into the dashboard.
4. Optionally seed the live demo workspace with `npm run seed:demo`.

Required production variables:

```bash
NEXT_PUBLIC_APP_URL=https://your-domain.example
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_publishable_or_anon_key
SUPABASE_SECRET_KEY=your_server_only_secret_key
BUILDTRACK_SESSION_SECRET=a_random_32_byte_or_longer_secret
BUILDTRACK_DEMO_PASSWORD_HASHES_JSON={"demo@example.com":"sha256_hash"}
```

Optional services:

```bash
OPENAI_API_KEY=your_server_only_openai_key
OPENAI_MODEL=gpt-4o-mini
GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_server_only_google_oauth_secret
GOOGLE_REDIRECT_URI=https://your-domain.example/api/google/callback
GOOGLE_TOKEN_ENCRYPTION_KEY=a_random_32_byte_or_longer_secret
CRON_SECRET=a_random_secret
```

`.env*` and `.vercel` are ignored by Git. Never expose `SUPABASE_SECRET_KEY`, OAuth client secrets, encryption keys, session secrets, or AI keys through `NEXT_PUBLIC_*` variables.

## Demo data

With `.env.local` configured:

```bash
npm run seed:demo
```

The seeder is idempotent and creates four projects plus representative schedule, report, finance, procurement, inventory, employee, and notification records. Authentication users are managed separately through Supabase Auth.

## Google Drive

Google Drive/Sheets integration is tenant-owned and optional. Each business authorizes its own Google account; server-encrypted refresh tokens are scoped to that tenant/project. Public use requires configuring the production OAuth redirect URI, publishing the consent screen, and completing any Google verification required for the requested Drive/Sheets scopes.

## Deployment

The repository is linked to Vercel. Add the variables above to the Production environment, then deploy with:

```bash
npx vercel --prod --yes
```

Production responses include HSTS, frame protection, MIME-sniffing protection, a Content Security Policy, restricted browser permissions, and no framework disclosure header.
