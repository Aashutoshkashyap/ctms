import React, { useMemo } from 'react';

interface Props {
  projects: any[];
  users: any[];
  onNavigate: (tab: string) => void;
}

export default function SuperAdminDashboard({ projects, users, onNavigate }: Props) {
  const businesses = useMemo(() => {
    const grouped = new Map<string, any[]>();
    projects.forEach(project => {
      const key = project.organization_name || project.lead_partner || 'Demo Business';
      grouped.set(key, [...(grouped.get(key) || []), project]);
    });
    return [...grouped.entries()].map(([name, items], index) => ({
      id: `biz-${index + 1}`,
      name,
      projects: items.length,
      plan: index === 0 ? 'Enterprise trial' : 'Project Pro',
      accessUntil: items[0]?.access_until || '2083-03-31 BS',
      status: items.some(project => project.status === 'archived') ? 'needs review' : 'active',
    }));
  }, [projects]);

  return <div className="space-y-6">
    <section className="rounded-2xl border border-purple-100 bg-gradient-to-r from-white to-purple-50 p-6 shadow-sm">
      <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-bold text-purple-700">Platform owner</span>
      <h1 className="mt-3 text-2xl font-extrabold text-slate-900">BuildTrack B2B SaaS Console</h1>
      <p className="mt-1 max-w-3xl text-slate-600">Manage onboarded businesses, trial access, pricing, subscription verification, contact responses and tenant admin creation.</p>
    </section>

    <section className="grid gap-3 md:grid-cols-4">
      <Metric label="Businesses" value={String(businesses.length)} />
      <Metric label="Projects hosted" value={String(projects.length)} />
      <Metric label="System users" value={String(users.length)} />
      <Metric label="Trial / Manual billing" value="Enabled" />
    </section>

    <section className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-bold text-slate-900">Business tenants</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">{['Business','Projects','Plan','Access until','Status','Action'].map(title => <th key={title} className="p-2">{title}</th>)}</tr></thead>
            <tbody>{businesses.map(business => <tr key={business.id} className="border-b border-slate-100">
              <td className="p-2 font-bold text-slate-900">{business.name}</td>
              <td className="p-2">{business.projects}</td>
              <td className="p-2">{business.plan}</td>
              <td className="p-2">{business.accessUntil}</td>
              <td className="p-2"><span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">{business.status}</span></td>
              <td className="p-2"><button onClick={() => onNavigate('settings')} className="font-bold text-blue-700">Create admin / edit access</button></td>
            </tr>)}</tbody>
          </table>
        </div>
      </div>

      <aside className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-bold text-slate-900">Pricing setup</h2>
          <div className="mt-3 space-y-2 text-sm text-slate-600">
            <div className="rounded-lg bg-slate-50 p-3"><b>Starter:</b> 1 project, limited users, trial friendly.</div>
            <div className="rounded-lg bg-slate-50 p-3"><b>Project Pro:</b> multi-project, reports, evidence vault.</div>
            <div className="rounded-lg bg-slate-50 p-3"><b>Enterprise:</b> tenant branding, longer storage, director portfolio.</div>
          </div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 shadow-sm">
          <b>Manual transaction verification:</b> keep this simple at first — record payment externally, then extend/limit tenant access from Settings.
        </div>
      </aside>
    </section>
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="text-xs font-bold uppercase text-slate-500">{label}</div>
    <div className="mt-1 text-xl font-extrabold text-slate-900">{value}</div>
  </div>;
}
