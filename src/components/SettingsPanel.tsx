// Settings Panel Component
import React, { useEffect, useState } from 'react';
import { isSupabaseConfigured, storage } from '../lib/storage';

interface SettingsPanelProps {
  users: any[];
  onAddUser: (user: any) => void;
  onResetDb: () => void;
  project: any;
  onUpdateProject: (proj: any) => void;
  userRole: string;
}

export default function SettingsPanel({
  users,
  onAddUser,
  onResetDb,
  project,
  onUpdateProject,
  userRole
}: SettingsPanelProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('site_engineer');
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [creatingUser, setCreatingUser] = useState(false);
  const [userMessage, setUserMessage] = useState('');
  const [googleStatus, setGoogleStatus] = useState<{ configured: boolean; connected: boolean; google_email?: string | null; project_folder_id?: string | null; sheet_id?: string | null; managed_by?: string | null; missing?: string[]; message?: string } | null>(null);

  // Project configuration edit state
  const [projName, setProjName] = useState(project.name);
  const [contractAmt, setContractAmt] = useState(project.contract_amount);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const session = await storage.getAuthSession();
        const response = await fetch(`/api/google/status?projectId=${encodeURIComponent(project.id)}`, {
          headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
          cache: 'no-store',
        });
        const data = await response.json();
        if (active) setGoogleStatus(data);
      } catch {
        if (active) setGoogleStatus({ configured: false, connected: false, message: 'Google workspace status is temporarily unavailable.' });
      }
    })();
    return () => { active = false; };
  }, [project.id]);

  const handleAddUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email) return;
    setCreatingUser(true);
    setUserMessage('');
    try {
      if (isSupabaseConfigured() && ['project_director', 'business_admin'].includes(userRole)) {
        const session = await storage.getAuthSession();
        if (!session) throw new Error('Sign in to Supabase before creating a cloud user.');
        const response = await fetch('/api/admin/users', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ name, email, role, projectId: project.id })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not create the project user.');
        onAddUser(result.user);
        setUserMessage(result.reusedAccount
          ? `${name}'s existing business account was assigned to this project.`
          : `Account created. Temporary password: ${result.temporaryPassword}`);
      } else {
        onAddUser({ name, email, role });
        setUserMessage(`Local personnel record created for ${name}.`);
      }
      setName('');
      setEmail('');
    } catch (error) {
      setUserMessage(error instanceof Error ? error.message : 'Could not create the project user.');
    } finally {
      setCreatingUser(false);
    }
  };

  const handleProjectUpdateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateProject({
      ...project,
      name: projName,
      contract_amount: contractAmt
    });
    alert('Project details updated and CPM schedule re-indexed.');
  };

  const handleReset = () => {
    if (confirm('Are you sure you want to reset all site reports, IPC claims, QAQC inspections, and restore the CPM timeline to original baseline?')) {
      onResetDb();
      alert('Database restored to default Kathmandu-Terai Fast Track baseline.');
      window.location.reload();
    }
  };

  const refreshWorkspace = async () => {
    setSyncing(true);
    setSyncMessage('');
    const result = await storage.bootstrapCloudWorkspace();
    setSyncMessage(result.message);
    setSyncing(false);
    if (result.ok) window.location.reload();
  };

  const connectGoogleDrive = async () => {
    if (userRole !== 'project_director') return;
    const session = await storage.getAuthSession();
    if (!session) {
      setSyncMessage('Sign in to the managed workspace before connecting Google Drive.');
      return;
    }
    const response = await fetch('/api/google/connect', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: project.id }),
    });
    const result = await response.json();
    if (!response.ok || !result.url) {
      setSyncMessage(result.message || 'Could not start Google authorization.');
      return;
    }
    window.location.assign(result.url);
  };

  const disconnectGoogleDrive = async () => {
    if (!confirm('Disconnect Google Drive for this project? Authorized uploads will stop until the Project Director reconnects it.')) return;
    const session = await storage.getAuthSession();
    if (!session) return;
    await fetch('/api/google/disconnect', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: project.id }),
    });
    setGoogleStatus({ configured: true, connected: false });
  };

  return (
    <div className="space-y-6 text-xs text-slate-300">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Project Details */}
        <div className="bg-slate-800/50 border border-slate-700/40 p-5 rounded-xl shadow space-y-4">
          <h3 className="text-slate-200 text-sm font-semibold">Project & Contract Details</h3>
          <form onSubmit={handleProjectUpdateSubmit} className="space-y-3">
            <div>
              <label className="block text-slate-400 mb-1">Project Name</label>
              <input
                type="text"
                value={projName}
                onChange={(e) => setProjName(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-slate-200"
                required
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Contract Amount (NPR)</label>
              <input
                type="number"
                value={contractAmt}
                onChange={(e) => setContractAmt(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-slate-200"
                required
              />
            </div>
            <button type="submit" className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded shadow transition">
              Save Project Changes
            </button>
          </form>
        </div>

        {/* Managed data workspace */}
        <div className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Managed Data Workspace</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-500">
                Shared project records synchronize automatically after sign-in, whenever the app regains focus, and after field updates reconnect.
              </p>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">Protected</span>
          </div>
          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            Connection keys are deployment-managed and never entered or displayed in the dashboard.
          </div>
          <button type="button" disabled={syncing} onClick={refreshWorkspace} className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2.5 font-bold text-white disabled:opacity-50">
            {syncing ? 'Refreshing shared records…' : 'Refresh Shared Records'}
          </button>
          {syncMessage && <p className="mt-2 text-xs text-blue-700">{syncMessage}</p>}
          {process.env.NODE_ENV !== 'production' && (
            <button type="button" onClick={handleReset} className="mt-3 w-full rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-bold text-rose-700">
              Reset local development data
            </button>
          )}
        </div>
      </div>

      <div className="bg-white border border-blue-100 rounded-xl p-5 shadow-sm space-y-4 text-slate-700">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-slate-900 text-sm font-bold">Tenant-owned Google Drive Storage</h3>
            <p className="mt-1 text-sm text-slate-500">
              Let each business store its own project files, employee records, expense sheets, photos and documents in its own Google Drive. Superadmin sees subscription/access only, not tenant files.
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${googleStatus?.connected ? 'bg-emerald-50 text-emerald-700' : googleStatus?.configured ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
            {googleStatus?.connected ? 'Drive connected' : googleStatus?.configured ? 'Ready to connect' : 'OAuth keys needed'}
          </span>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="text-[10px] font-bold uppercase text-slate-500">Folder pattern</div>
            <div className="mt-1 text-xs text-slate-700">BuildTrack - Business / Project / Daily Reports, Expenses, Employees, Documents, Photos</div>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="text-[10px] font-bold uppercase text-slate-500">Sheets created</div>
            <div className="mt-1 text-xs text-slate-700">Employees, Expenses, Daily Reports and Inventory tabs</div>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="text-[10px] font-bold uppercase text-slate-500">File naming</div>
            <div className="mt-1 text-xs text-slate-700">date_employee_BOQ_remarks/reference.ext</div>
          </div>
        </div>
        {googleStatus?.connected && (
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-800">
            Connected{googleStatus.google_email ? ` as ${googleStatus.google_email}` : ''}. Project folder ID: <span className="font-mono">{googleStatus.project_folder_id || 'protected'}</span>
            {googleStatus.sheet_id && <span> · Sheet ID: <span className="font-mono">{googleStatus.sheet_id}</span></span>}
          </div>
        )}
        {!googleStatus?.configured && (
          <div className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-xs text-amber-800">
            Missing server env: {(googleStatus?.missing || ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']).join(', ')}. Add these from Google Cloud OAuth, then restart/deploy.
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {userRole === 'project_director' ? <button
            type="button"
            onClick={() => void connectGoogleDrive()}
            disabled={!googleStatus?.configured}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {googleStatus?.connected ? 'Reconnect Business Google Drive' : 'Connect Business Google Drive'}
          </button> : <div className="rounded-lg bg-slate-50 px-4 py-2 text-sm text-slate-600">Only the Project Director can connect or replace tenant Google storage.</div>}
          {googleStatus?.connected && userRole === 'project_director' && (
            <button
              type="button"
              onClick={disconnectGoogleDrive}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700"
            >
              Disconnect Google
            </button>
          )}
        </div>
        <p className="text-[10px] text-slate-500">
          Gmail sending can be enabled later for project notices and report emails using the optional gmail.send scope. It is intentionally disabled by default to keep Google verification simpler.
        </p>
      </div>

      {/* Users and Roles list */}
      <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-5 shadow space-y-4">
        <h3 className="text-slate-200 text-sm font-semibold">JV / Project Personnel Directory</h3>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <form onSubmit={handleAddUserSubmit} className="lg:col-span-1 border border-slate-750 p-4 rounded-lg bg-slate-900/20 space-y-3">
            <h4 className="text-slate-200 font-semibold mb-1">Add Personnel</h4>
            <div>
              <label className="block text-slate-400 mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-slate-200"
                required
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-slate-200"
                required
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Role Permission</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-slate-200"
              >
                <option value="business_admin">Business Administrator</option>
                <option value="project_director">Project Director</option>
                <option value="project_manager">Project Manager</option>
                <option value="planning_engineer">Planning Engineer</option>
                <option value="site_engineer">Site Engineer</option>
                <option value="qs_billing_engineer">QS / Billing Engineer</option>
                <option value="design_coordinator">Design Coordinator</option>
                <option value="qa_qc_engineer">QA / QC Engineer</option>
                <option value="safety_officer">Safety Officer</option>
                <option value="accountant">Accountant</option>
                <option value="store_officer">Store Officer</option>
                <option value="subcontractor">Subcontractor</option>
                <option value="jv_partner">JV Partner</option>
                <option value="employer_viewer">Employer / Client Representative</option>
                <option value="field_employee">Field Employee</option>
              </select>
            </div>
            <button disabled={creatingUser} type="submit" className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded shadow transition w-full">
              {creatingUser ? 'Creating Login…' : 'Create Project Login'}
            </button>
            {userMessage && <p className="rounded bg-blue-50 p-2 text-blue-700">{userMessage}</p>}
          </form>

          <div className="lg:col-span-2 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400 font-semibold">
                  <th className="pb-3">Name</th>
                  <th className="pb-3">Email Address</th>
                  <th className="pb-3 text-right">Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {users.map((u, index) => (
                  <tr key={`${u.email}-${u.role}-${index}`} className="hover:bg-slate-800/10">
                    <td className="py-2.5 font-semibold text-slate-100">{u.name}</td>
                    <td className="py-2.5 font-mono text-slate-400">{u.email}</td>
                    <td className="py-2.5 text-right">
                      <span className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-full text-[10px] text-slate-400 font-bold uppercase">
                        {u.role.replace(/_/g, ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
