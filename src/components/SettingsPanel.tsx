// Settings Panel Component
import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { isSupabaseConfigured, storage } from '../lib/storage';
import { buildDefaultPermissions, defaultPermissionLevel, DIRECTOR_MANAGED_FEATURES } from '../lib/permissions';
import type { FeaturePermissions, PermissionLevel } from '../lib/permissions';
import { PageHeader } from './ManagementUI';

interface SettingsPanelProps {
  users: any[];
  onAddUser: (user: any) => void;
  onResetDb: () => void;
  project: any;
  onUpdateProject: (proj: any) => void;
  userRole: string;
  onUsersChanged: () => void;
}

export default function SettingsPanel({
  users,
  onAddUser,
  onResetDb,
  project,
  onUpdateProject,
  userRole,
  onUsersChanged,
}: SettingsPanelProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('site_engineer');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [permissions, setPermissions] = useState<FeaturePermissions>(() => buildDefaultPermissions('site_engineer'));
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [creatingUser, setCreatingUser] = useState(false);
  const [userMessage, setUserMessage] = useState('');
  const [googleStatus, setGoogleStatus] = useState<{ configured: boolean; connected: boolean; reconnect_required?: boolean; google_email?: string | null; project_folder_id?: string | null; sheet_id?: string | null; managed_by?: string | null; missing?: string[]; message?: string } | null>(null);
  const [whatsAppStatus, setWhatsAppStatus] = useState<{ configured: boolean; status: string; phone?: string | null; displayName?: string | null; lastConnectedAt?: string | null; lastDisconnectedAt?: string | null; lastError?: string | null; message?: string } | null>(null);
  const [whatsAppQr, setWhatsAppQr] = useState<string | null>(null);
  const [whatsAppBusy, setWhatsAppBusy] = useState(false);

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

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const session = await storage.getAuthSession();
        const response = await fetch('/api/company-admin/whatsapp', { headers: session ? { Authorization: `Bearer ${session.access_token}` } : {}, cache: 'no-store' });
        const data = await response.json().catch(() => null);
        if (active && response.ok) setWhatsAppStatus(data);
      } catch { /* the settings screen remains usable without WhatsApp */ }
    })();
    return () => { active = false; };
  }, [project.id, userRole]);

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
          body: JSON.stringify({ name, email, role, projectId: project.id, temporaryPassword, featurePermissions: permissions })
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
      setTemporaryPassword('');
    } catch (error) {
      setUserMessage(error instanceof Error ? error.message : 'Could not create the project user.');
    } finally {
      setCreatingUser(false);
    }
  };

  const saveStaffAccess = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingUser || userRole !== 'project_director') return;
    setCreatingUser(true);
    setUserMessage('');
    try {
      const session = await storage.getAuthSession();
      if (!session) throw new Error('Sign in to update staff access.');
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id, membershipId: editingUser.id, role: editingUser.role, featurePermissions: editingUser.feature_permissions }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not update staff access.');
      storage.updateCachedProjectUser(result.user);
      setEditingUser(null);
      setUserMessage('Staff dashboard and read/write permissions updated. The change applies on their next refresh.');
      onUsersChanged();
    } catch (error) {
      setUserMessage(error instanceof Error ? error.message : 'Could not update staff access.');
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
    alert('Project details updated and the work schedule was recalculated.');
  };

  const handleReset = () => {
    if (confirm('Are you sure you want to reset all site reports, IPC claims, QAQC inspections, and restore the work schedule to its original baseline?')) {
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

  const manageWhatsApp = async (action: 'pair' | 'disconnect') => {
    if (!['project_director', 'business_admin'].includes(userRole)) return;
    if (action === 'disconnect' && !confirm('Disconnect this organization’s WhatsApp number? Incoming WhatsApp alerts will stop until it is paired again.')) return;
    setWhatsAppBusy(true); setSyncMessage('');
    try {
      const session = await storage.getAuthSession();
      if (!session) throw new Error('Sign in to manage WhatsApp.');
      const response = await fetch('/api/company-admin/whatsapp', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'WhatsApp connection could not be updated.');
      setWhatsAppQr(typeof result.qr === 'string' ? result.qr : null);
      setWhatsAppStatus(current => ({ configured: true, status: result.status, phone: result.phone || current?.phone || null, displayName: result.displayName || current?.displayName || null, lastConnectedAt: result.status === 'CONNECTED' ? new Date().toISOString() : current?.lastConnectedAt || null }));
    } catch (error) { setSyncMessage(error instanceof Error ? error.message : 'WhatsApp connection could not be updated.'); }
    finally { setWhatsAppBusy(false); }
  };

  return (
    <div className="space-y-6 text-sm text-slate-700">
      <PageHeader eyebrow="Settings" title="Project settings" description="Manage project details, team access and connected storage from one place." />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Project Details */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <h3 className="text-base font-semibold text-slate-950">Project details</h3>
          <form onSubmit={handleProjectUpdateSubmit} className="space-y-3">
            <div>
              <label className="mb-1 block font-medium text-slate-700">Project name</label>
              <input
                type="text"
                value={projName}
                onChange={(e) => setProjName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-950"
                required
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700">Contract amount (NPR)</label>
              <input
                type="number"
                value={contractAmt}
                onChange={(e) => setContractAmt(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-950"
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

      <details className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm text-slate-700"><summary className="cursor-pointer text-base font-semibold text-slate-950">Google Drive & document storage</summary><div className="mt-5 space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-slate-900 text-sm font-bold">Business Google Drive connection</h3>
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
        {googleStatus?.configured && googleStatus.reconnect_required && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            The previous Google authorization can no longer be decrypted after the security-key rotation. The Project Director must reconnect once to issue a fresh protected token.
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {['project_director', 'business_admin'].includes(userRole) ? <button
            type="button"
            onClick={() => void connectGoogleDrive()}
            disabled={!googleStatus?.configured}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {googleStatus?.connected || googleStatus?.reconnect_required ? 'Reconnect Business Google Drive' : 'Connect Business Google Drive'}
          </button> : <div className="rounded-lg bg-slate-50 px-4 py-2 text-sm text-slate-600">Only the Project Director or Company Admin can manage tenant Google storage.</div>}
          {googleStatus?.connected && ['project_director', 'business_admin'].includes(userRole) && (
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
      </div></details>

      <details className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm text-slate-700"><summary className="cursor-pointer text-base font-semibold text-slate-950">WhatsApp connection</summary><div className="mt-5 space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><h3 className="text-sm font-bold text-slate-900">Company WhatsApp</h3><p className="mt-1 text-sm text-slate-500">Connect one company number for internal inbound-message alerts. WhatsApp cannot approve, pay, edit, or otherwise change CTMS records.</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${whatsAppStatus?.status === 'CONNECTED' ? 'bg-emerald-50 text-emerald-700' : whatsAppStatus?.status === 'WAITING_FOR_PAIRING' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{whatsAppStatus?.status === 'CONNECTED' ? 'Connected' : whatsAppStatus?.status === 'WAITING_FOR_PAIRING' ? 'Waiting for pairing' : whatsAppStatus?.configured === false ? 'Not configured' : 'Not connected'}</span></div>
        {whatsAppStatus?.configured === false ? <p className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-xs text-amber-800">WhatsApp integration is not configured on the server.</p> : <>
          {whatsAppStatus?.status === 'CONNECTED' && <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-800">Connected{whatsAppStatus.phone ? ` as ${whatsAppStatus.phone}` : ''}{whatsAppStatus.lastConnectedAt ? ` · ${new Date(whatsAppStatus.lastConnectedAt).toLocaleString()}` : ''}</div>}
          {whatsAppStatus?.lastError && <p className="rounded-lg border border-rose-100 bg-rose-50 p-3 text-xs text-rose-800">{whatsAppStatus.lastError}</p>}
          {whatsAppQr && <div className="max-w-sm rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="font-bold text-amber-950">Scan this temporary pairing code</p><p className="mt-1 text-xs text-amber-900">Open WhatsApp on the company phone, then Linked devices. This code is not stored by CTMS.</p><Image unoptimized src={whatsAppQr} alt="Temporary WhatsApp pairing QR" width={224} height={224} className="mt-3 h-56 w-56 bg-white object-contain p-2" /></div>}
          {['project_director', 'business_admin'].includes(userRole) ? <div className="flex flex-wrap gap-2"><button type="button" disabled={whatsAppBusy} onClick={() => void manageWhatsApp('pair')} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{whatsAppBusy ? 'Connecting…' : whatsAppStatus?.status === 'CONNECTED' ? 'Reconnect WhatsApp' : 'Connect WhatsApp'}</button>{whatsAppStatus?.status === 'CONNECTED' && <button type="button" disabled={whatsAppBusy} onClick={() => void manageWhatsApp('disconnect')} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700">Disconnect</button>}</div> : <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Only the Project Director or Company Admin can manage the company WhatsApp connection.</p>}
        </>}
      </div></details>

      {/* Users and Roles list */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <h3 className="text-base font-semibold text-slate-950">Team access</h3>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <form onSubmit={handleAddUserSubmit} className="lg:col-span-1 rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
            <h4 className="mb-1 font-semibold text-slate-950">Add team member</h4>
            <div>
              <label className="mb-1 block font-medium text-slate-700">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-950"
                required
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-950"
                required
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700">Role</label>
              <select
                value={role}
                onChange={(e) => { setRole(e.target.value); setPermissions(buildDefaultPermissions(e.target.value)); }}
                className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-950"
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
            {isSupabaseConfigured() && <div>
              <label className="mb-1 block font-medium text-slate-700">Temporary password</label>
              <input
                type="text"
                minLength={10}
                autoComplete="new-password"
                value={temporaryPassword}
                onChange={(event)=>setTemporaryPassword(event.target.value)}
                placeholder="Director creates first password"
                className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-950"
                required
              />
              <p className="mt-1 text-[10px] text-slate-500">At least 10 characters with upper-case, lower-case and a number. The employee can later use Forgot Password.</p>
            </div>}
            {userRole === 'project_director' && !['project_director','business_admin'].includes(role) && <PermissionGrid role={role} permissions={permissions} onChange={setPermissions} compact />}
            <button disabled={creatingUser} type="submit" className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded shadow transition w-full">
              {creatingUser ? 'Creating Login…' : 'Create Project Login'}
            </button>
            {userMessage && <p className="rounded bg-blue-50 p-2 text-blue-700">{userMessage}</p>}
          </form>

          <div className="lg:col-span-2 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 font-semibold text-slate-600">
                  <th className="pb-3">Name</th>
                  <th className="pb-3">Email Address</th>
                  <th className="pb-3">Access</th>
                  <th className="pb-3 text-right">Role / Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-700">
                {users.map((u, index) => (
                  <tr key={`${u.email}-${u.role}-${index}`} className="hover:bg-slate-50">
                    <td className="py-2.5 font-semibold text-slate-950">{u.name}</td>
                    <td className="py-2.5 font-mono text-slate-600">{u.email}</td>
                    <td className="py-2.5 text-slate-600">{permissionSummary(u.feature_permissions, u.role)}</td>
                    <td className="py-2.5 text-right">
                      <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-700">
                        {u.role.replace(/_/g, ' ')}
                      </span>
                      {userRole==='project_director'&&!['project_director','business_admin','super_admin'].includes(u.role)&&u.id&&<button type="button" onClick={()=>setEditingUser({...u,feature_permissions:{...buildDefaultPermissions(u.role),...(u.feature_permissions||{})}})} className="ml-2 font-bold text-blue-800">Edit access</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {editingUser&&<form onSubmit={saveStaffAccess} className="rounded-xl border border-blue-200 bg-white p-5 text-slate-700 shadow-sm"><div className="flex flex-col justify-between gap-2 sm:flex-row"><div><h4 className="font-bold text-slate-950">Edit staff dashboard access</h4><p className="text-sm text-slate-600">{editingUser.name} · {editingUser.email}</p></div><button type="button" onClick={()=>setEditingUser(null)} className="font-bold text-slate-700">Close</button></div><div className="mt-4 max-w-sm"><label className="text-sm font-semibold">Staff role<select value={editingUser.role} onChange={event=>setEditingUser({...editingUser,role:event.target.value,feature_permissions:buildDefaultPermissions(event.target.value)})} className="mt-1 w-full rounded-lg"><option value="project_manager">Project Manager</option><option value="planning_engineer">Planning Engineer</option><option value="site_engineer">Site Engineer</option><option value="qs_billing_engineer">QS / Billing Engineer</option><option value="design_coordinator">Design Coordinator</option><option value="qa_qc_engineer">QA / QC Engineer</option><option value="safety_officer">Safety Officer</option><option value="accountant">Accountant</option><option value="store_officer">Store Officer</option><option value="subcontractor">Subcontractor</option><option value="jv_partner">JV Partner</option><option value="employer_viewer">Employer / Client Viewer</option><option value="field_employee">Field Employee</option></select></label></div><div className="mt-4"><PermissionGrid role={editingUser.role} permissions={editingUser.feature_permissions} onChange={feature_permissions=>setEditingUser({...editingUser,feature_permissions})}/></div><button disabled={creatingUser} className="mt-4 rounded-lg bg-blue-700 px-4 py-2.5 font-bold text-white disabled:opacity-60">{creatingUser?'Saving permissions…':'Save staff access'}</button></form>}
      </div>
    </div>
  );
}

function PermissionGrid({role,permissions,onChange,compact=false}:{role:string;permissions:FeaturePermissions;onChange:(value:FeaturePermissions)=>void;compact?:boolean}) {
  return <div className={`rounded-lg border border-slate-200 bg-white p-3 text-slate-700 ${compact?'max-h-72 overflow-y-auto':''}`}><div className="mb-2"><b className="text-slate-950">Feature access</b><p className="text-[10px] text-slate-500">The role sets the maximum authority. The Director can hide a page or reduce Edit to View.</p></div><div className={compact?'space-y-2':'grid gap-2 md:grid-cols-2 xl:grid-cols-3'}>{DIRECTOR_MANAGED_FEATURES.map(item=>{const baseline=defaultPermissionLevel(role,item.feature);return <label key={item.feature} className={`flex items-center justify-between gap-2 rounded-md border border-slate-100 p-2 text-xs ${baseline==='none'?'bg-slate-100 text-slate-400':'bg-slate-50'}`}><span className="font-semibold">{item.label}</span><select disabled={baseline==='none'} aria-label={`${item.label} permission`} value={baseline==='none'?'none':permissions[item.feature]||baseline} onChange={event=>onChange({...permissions,[item.feature]:event.target.value as PermissionLevel})} className="min-h-8 w-24 rounded-md p-1 text-xs"><option value="none">None</option>{baseline!=='none'&&<option value="read">View</option>}{baseline==='write'&&<option value="write">Edit</option>}</select></label>})}</div></div>;
}

function permissionSummary(value:FeaturePermissions|undefined,role:string) {
  const permissions={...buildDefaultPermissions(role),...(value||{})};
  const visible=DIRECTOR_MANAGED_FEATURES.filter(item=>permissions[item.feature]&&permissions[item.feature]!=='none').length;
  const editable=DIRECTOR_MANAGED_FEATURES.filter(item=>permissions[item.feature]==='write').length;
  return `${visible} visible · ${editable} editable`;
}
