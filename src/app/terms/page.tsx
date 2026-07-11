import Link from 'next/link';

export const metadata = {
  title: 'Terms of Service | BuildTrack D&B',
  description: 'Terms of service for BuildTrack D&B project control system.',
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-800">
      <article className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-10">
        <Link href="/" className="text-sm font-bold text-blue-700">← Back to BuildTrack</Link>
        <h1 className="mt-6 text-3xl font-extrabold text-slate-950">Terms of Service</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated: July 11, 2026</p>

        <section className="mt-8 space-y-4">
          <h2 className="text-xl font-bold text-slate-900">Use of BuildTrack</h2>
          <p>
            BuildTrack D&amp;B is a project control system for construction and design-build project
            management. Users are responsible for entering accurate project, employee, expense, document
            and site records.
          </p>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-xl font-bold text-slate-900">Tenant-owned data</h2>
          <p>
            Each business tenant is responsible for its own project data. When Google Drive is connected,
            files and spreadsheets are stored in the tenant’s Google account. The tenant is responsible
            for managing Google account access, sharing, retention and deletion.
          </p>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-xl font-bold text-slate-900">Google integration</h2>
          <p>
            If a tenant connects Google Drive or Google Sheets, BuildTrack will use the granted access to
            create folders, upload project documents/images and create or update project record sheets.
            Users may revoke access from their Google Account permissions at any time.
          </p>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-xl font-bold text-slate-900">Optional email sending</h2>
          <p>
            If enabled by the tenant, BuildTrack may send project-related emails such as daily reports,
            notices, reminders or task assignments using an authorized Google account. Users remain
            responsible for verifying recipients and message contents before sending.
          </p>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-xl font-bold text-slate-900">Superadmin access</h2>
          <p>
            Platform superadmins manage subscription/access status and tenant administration. They should
            not access sensitive tenant files, payroll, employee records, expense details or project
            documents unless explicitly authorized by the tenant.
          </p>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-xl font-bold text-slate-900">Availability and backups</h2>
          <p>
            BuildTrack may include local continuity and cloud synchronization features. Tenants should
            maintain their own backups of important records and verify critical contract, finance and
            safety information before relying on reports.
          </p>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-xl font-bold text-slate-900">Limitations</h2>
          <p>
            BuildTrack is a project management and control tool. It does not replace professional legal,
            contractual, accounting, engineering, safety or compliance advice.
          </p>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-xl font-bold text-slate-900">Contact</h2>
          <p>
            Contact the BuildTrack administrator or developer contact configured in the OAuth consent
            screen for service questions.
          </p>
        </section>
      </article>
    </main>
  );
}
