import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy | BuildTrack D&B',
  description: 'Privacy policy for BuildTrack D&B project control system.',
};

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-800">
      <article className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-10">
        <Link href="/" className="text-sm font-bold text-blue-700">← Back to BuildTrack</Link>
        <h1 className="mt-6 text-3xl font-extrabold text-slate-950">Privacy Policy</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated: July 11, 2026</p>

        <section className="mt-8 space-y-4">
          <h2 className="text-xl font-bold text-slate-900">What BuildTrack does</h2>
          <p>
            BuildTrack D&amp;B helps construction businesses manage projects, employees, daily site
            reports, expenses, documents, images, procurement, quality, safety, contract obligations
            and project controls.
          </p>
          <p>
            For tenant-owned storage, BuildTrack can connect to a business Google Drive and Google
            Sheets account after that business admin grants permission.
          </p>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-xl font-bold text-slate-900">Information we process</h2>
          <ul className="list-disc space-y-2 pl-6">
            <li>Account details such as name, email, role and organization.</li>
            <li>Project records such as project name, contract number, schedule and status.</li>
            <li>Operational records such as daily reports, work quantities, resource use and remarks.</li>
            <li>Employee records entered by the tenant, including employee ID, name, role and payroll-related data where used.</li>
            <li>Expense, procurement, quality, safety, document and image metadata.</li>
            <li>Google Drive file IDs, folder IDs and Google Sheet IDs when Google storage is connected.</li>
          </ul>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-xl font-bold text-slate-900">Google Drive and Google Sheets access</h2>
          <p>
            BuildTrack requests Google Drive and Google Sheets access only when a tenant/business admin
            chooses to connect Google storage. The app uses this access to create project folders,
            upload tenant files, and create/update project Google Sheets for records such as employees,
            expenses, inventory and daily reports.
          </p>
          <p>
            BuildTrack uses tenant-owned Google storage so each business keeps control of its own
            documents and images. Platform superadmins should not access tenant project files.
          </p>
          <p>
            BuildTrack does not sell Google user data. Google user data is used only to provide
            project storage, document upload and spreadsheet record functionality requested by the tenant.
          </p>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-xl font-bold text-slate-900">Optional Gmail sending</h2>
          <p>
            BuildTrack may optionally use Gmail send-only access to send project notices, reports,
            reminders or task emails from a tenant-connected Google account. BuildTrack does not need
            Gmail inbox reading for the core Drive/Sheets storage workflow, and Gmail sending is disabled
            unless explicitly enabled and authorized.
          </p>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-xl font-bold text-slate-900">How we store data</h2>
          <p>
            Sensitive tenant files may be stored in the tenant’s connected Google Drive. BuildTrack may
            keep minimal metadata such as project ID, file ID, folder ID, uploader and timestamps for
            indexing, permissions and audit trails.
          </p>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-xl font-bold text-slate-900">User control and revocation</h2>
          <p>
            A tenant can disconnect Google access by removing BuildTrack access from their Google
            Account permissions page, or by using a disconnect control when enabled in the app.
          </p>
          <p>
            Google account permissions can be reviewed at{' '}
            <a className="font-bold text-blue-700" href="https://myaccount.google.com/permissions">
              https://myaccount.google.com/permissions
            </a>.
          </p>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-xl font-bold text-slate-900">Contact</h2>
          <p>
            For privacy questions or data deletion requests, contact the BuildTrack administrator or the
            developer contact configured in Google Cloud OAuth consent screen.
          </p>
        </section>
      </article>
    </main>
  );
}
