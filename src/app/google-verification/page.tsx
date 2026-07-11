import Link from 'next/link';

export const metadata = {
  title: 'Google Integration Verification | BuildTrack D&B',
  description: 'Google Drive and Sheets integration explanation for BuildTrack D&B.',
};

export default function GoogleVerificationPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-800">
      <article className="mx-auto max-w-5xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-10">
        <Link href="/" className="text-sm font-bold text-blue-700">← Back to BuildTrack</Link>
        <h1 className="mt-6 text-3xl font-extrabold text-slate-950">Google Drive &amp; Sheets Integration</h1>
        <p className="mt-2 max-w-3xl text-slate-600">
          This page explains how BuildTrack uses Google APIs for tenant-owned construction project
          document storage and spreadsheet records.
        </p>

        <section className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-5">
            <h2 className="font-bold text-blue-900">Requested Drive scope</h2>
            <p className="mt-2 text-sm text-blue-800">
              <code>drive.file</code> lets BuildTrack create and manage files/folders that the tenant
              explicitly creates or opens through BuildTrack. It avoids requesting full Drive access.
            </p>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-5">
            <h2 className="font-bold text-emerald-900">Requested Sheets scope</h2>
            <p className="mt-2 text-sm text-emerald-800">
              <code>spreadsheets</code> lets BuildTrack create and update tenant project sheets for
              employees, expenses, inventory and daily report registers.
            </p>
          </div>
        </section>

        <section className="mt-8 rounded-xl border border-amber-100 bg-amber-50 p-5">
          <h2 className="font-bold text-amber-900">Optional Gmail send scope</h2>
          <p className="mt-2 text-sm text-amber-800">
            Gmail sending is optional and disabled by default. If enabled, BuildTrack requests
            <code className="mx-1 rounded bg-white px-1">gmail.send</code> only to send project notices,
            daily report emails, reminders and task assignment emails from a tenant-authorized account.
            BuildTrack does not require Gmail inbox reading for the core tenant storage workflow.
          </p>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-xl font-bold text-slate-900">User flow</h2>
          <ol className="list-decimal space-y-2 pl-6">
            <li>Tenant admin logs in to BuildTrack.</li>
            <li>Tenant admin opens System Settings.</li>
            <li>Tenant admin clicks Connect Business Google Drive.</li>
            <li>Google asks the tenant admin to approve Drive and Sheets access.</li>
            <li>BuildTrack creates a tenant project folder and project spreadsheet.</li>
            <li>Uploaded site photos, payment slips and documents are stored in the tenant Drive.</li>
            <li>Employee, expense and daily report summaries are appended to Google Sheets.</li>
          </ol>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-xl font-bold text-slate-900">Folder structure created</h2>
          <pre className="overflow-x-auto rounded-xl bg-slate-950 p-4 text-sm text-slate-100">
{`BuildTrack - Business Name/
  Projects/
    Project Name - Project ID/
      Daily Reports/
      Expenses/
      Employees/
      Documents/
      Photos/
      BuildTrack Records - Project Name`}
          </pre>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-xl font-bold text-slate-900">File naming</h2>
          <p>
            BuildTrack names uploaded files using project context so tenants can identify records in
            Drive without opening the app.
          </p>
          <pre className="overflow-x-auto rounded-xl bg-slate-950 p-4 text-sm text-slate-100">
{`2026-07-11_Binod-Tamang_BOQ-03.02_excavation-progress.jpg`}
          </pre>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-xl font-bold text-slate-900">Data separation</h2>
          <p>
            Superadmins manage SaaS access and billing state. Tenant project files remain in the
            tenant’s Google Drive and are not exposed to platform superadmins through the app.
          </p>
        </section>

        <section className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-5">
          <h2 className="font-bold text-slate-900">Related pages</h2>
          <div className="mt-3 flex flex-wrap gap-3">
            <Link href="/privacy" className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-blue-700 shadow-sm">Privacy Policy</Link>
            <Link href="/terms" className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-blue-700 shadow-sm">Terms of Service</Link>
          </div>
        </section>
      </article>
    </main>
  );
}
