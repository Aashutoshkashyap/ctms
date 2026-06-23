// Settings Panel Component
import React, { useState } from 'react';
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
  const initialSupabase = storage.getSupabaseConfig();
  const [supabaseUrl, setSupabaseUrl] = useState(initialSupabase.url);
  const [supabaseKey, setSupabaseKey] = useState(initialSupabase.key);
  const [connectionState, setConnectionState] = useState<'idle' | 'testing' | 'connected' | 'error'>(
    isSupabaseConfigured() ? 'connected' : 'idle'
  );
  const [connectionMessage, setConnectionMessage] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [creatingUser, setCreatingUser] = useState(false);
  const [userMessage, setUserMessage] = useState('');

  // Project configuration edit state
  const [projName, setProjName] = useState(project.name);
  const [contractAmt, setContractAmt] = useState(project.contract_amount);

  const handleAddUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email) return;
    setCreatingUser(true);
    setUserMessage('');
    try {
      if (isSupabaseConfigured() && userRole === 'project_director') {
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
        setUserMessage(`Account created. Temporary password: ${result.temporaryPassword}`);
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

  const handleSupabaseConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setConnectionState('testing');
    setConnectionMessage('Testing database access…');
    storage.setSupabaseConfig(supabaseUrl.trim(), supabaseKey.trim());
    const result = await storage.testSupabaseConnection();
    setConnectionState(result.ok ? 'connected' : 'error');
    setConnectionMessage(result.message);
  };

  const runSync = async (direction: 'push' | 'pull') => {
    setSyncing(true);
    setSyncMessage('');
    const result = direction === 'push'
      ? await storage.syncActiveProjectToCloud()
      : await storage.pullActiveProjectFromCloud();
    setSyncMessage(result.message);
    setSyncing(false);
    if (result.ok && direction === 'pull') window.location.reload();
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

        {/* Database setup */}
        <div className="bg-slate-800/50 border border-slate-700/40 p-5 rounded-xl shadow space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <h3 className="text-slate-200 text-sm font-semibold">Cloud Sync & Authentication <span className="text-blue-600">(Optional)</span></h3>
            <p className="text-slate-500 leading-relaxed">
              BuildTrack works fully in local sandbox mode without Supabase. Connect it only when you need shared project access, cloud backup, cross-device synchronization, or managed user authentication.
            </p>
            <div className="border border-slate-750 p-3 rounded bg-slate-900/20 space-y-3">
              <div className="flex justify-between items-center">
                <span>Database Client Status:</span>
                <span className={`px-2 py-0.5 rounded font-bold ${connectionState === 'connected' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-750 text-slate-400'}`}>
                  {connectionState === 'connected' ? 'Cloud Workspace Connected' : 'Local Mode — Ready to Use'}
                </span>
              </div>
              <form onSubmit={handleSupabaseConnect} className="space-y-2">
                <input
                  type="url"
                  value={supabaseUrl}
                  onChange={(e) => setSupabaseUrl(e.target.value)}
                  placeholder="https://your-project.supabase.co"
                  className="w-full bg-slate-950 border border-slate-700 p-2 rounded text-slate-200"
                  required
                />
                <input
                  type="password"
                  value={supabaseKey}
                  onChange={(e) => setSupabaseKey(e.target.value)}
                  placeholder="Supabase anon key"
                  className="w-full bg-slate-950 border border-slate-700 p-2 rounded text-slate-200"
                  required
                />
                <button
                  type="submit"
                  disabled={connectionState === 'testing'}
                  className="w-full px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded"
                >
                  {connectionState === 'testing' ? 'Testing Connection…' : 'Enable Optional Cloud Sync'}
                </button>
              </form>
              {connectionMessage && (
                <p className={`text-[10px] ${connectionState === 'error' ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {connectionMessage}
                </p>
              )}
              <p className="text-[10px] text-slate-500 leading-normal">
                First-time cloud setup: run the complete `supabase_schema.sql` in the Supabase SQL Editor. Do not run the upgrade file on an empty database. The complete schema also creates the private `site-photos` bucket and role policies. Then enter the project URL and anon/publishable key here.
              </p>
              {connectionState === 'connected' && userRole === 'project_director' && (
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
                  <button type="button" disabled={syncing} onClick={() => runSync('push')} className="bg-blue-600 disabled:opacity-50 p-2 rounded font-semibold">
                    Push Project to Cloud
                  </button>
                  <button type="button" disabled={syncing} onClick={() => runSync('pull')} className="bg-slate-700 disabled:opacity-50 p-2 rounded font-semibold">
                    Pull Project from Cloud
                  </button>
                </div>
              )}
              {connectionState === 'connected' && userRole !== 'project_director' && (
                <p className="border-t border-slate-200 pt-2 text-[10px] text-slate-500">Full project push/pull is Director-controlled. Administrative changes continue to save in this workspace.</p>
              )}
              {syncMessage && <p className="text-[10px] text-blue-300">{syncMessage}</p>}
            </div>
          </div>
          <div className="border-t border-slate-800 pt-4">
            <h4 className="text-slate-200 font-semibold mb-2">Sandbox Management</h4>
            <button
              onClick={handleReset}
              className="px-3 py-1.5 bg-rose-900/60 hover:bg-rose-900 text-rose-200 border border-rose-800 font-semibold rounded shadow transition w-full text-center"
            >
              ⚠️ Reset Sandbox Database to Default
            </button>
          </div>
        </div>
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
                <option value="super_admin">Project Administrator</option>
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
