# BuildTrack D&B Project Control System

A browser-ready Design & Build project controls workspace built with Next.js 16, Tailwind CSS, local persistence, and optional Supabase connectivity.

Included modules:

- Signup and role-based onboarding
- Multi-project project controls
- WBS/CPM scheduling and AI tender scanning
- Manual WBS/activity entry with predecessor logic
- Earned value, budgets, IPCs, claims, QA/QC, safety, and handover
- Expandable finance model with cash-flow charts
- Project-scoped document status register
- Procurement, delivery and stores ledger
- Daily expense register with WBS, vendor and approval tracking
- Contract obligations and expiry/deadline control
- Daily site reporting with progress photos
- Printable/CSV/JSON report and evidence packs
- Browser-based Supabase Auth, Storage and project synchronization

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

The app starts in local sandbox mode. Data is saved in browser local storage.

## Optional configuration

For AI-assisted analysis, create `.env.local`:

```bash
OPENAI_API_KEY=your_key
OPENAI_MODEL=gpt-4o-mini
```

To use OpenRouter or another OpenAI-compatible provider, also set `OPENAI_BASE_URL` and the provider-specific model name.

For Supabase:

1. Run `supabase_schema.sql` in the Supabase SQL editor.
   - On a new or empty database, always run the complete schema first.
   - Only run `supabase_role_upgrade.sql` when the original BuildTrack tables already exist.
2. Enable Email authentication and optionally configure the Google provider.
3. Paste the project URL and anon/publishable key into **System Settings → Supabase Integration Status**.
4. Sign out and create/sign into a Supabase-backed account.
5. Use **Push Project to Cloud** for the first upload. Later changes synchronize automatically; **Pull Project from Cloud** restores the cloud copy into the browser.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
