import React, { useEffect, useMemo, useState } from 'react';
import { storage } from '../lib/storage';

type BusinessTenant = {
  id: string;
  name: string;
  contact_email?: string | null;
  plan: string;
  subscription_status: string;
  access_until?: string | null;
  seat_limit?: number;
  project_limit?: number;
  created_at?: string;
};

type BusinessInquiry = {
  id: string;
  business_name: string;
  contact_name: string;
  contact_email: string;
  phone?: string | null;
  message?: string | null;
  status: string;
  created_at: string;
};

type SubscriptionTransaction = {
  id: string;
  organization_id: string;
  reference: string;
  amount: number;
  currency: string;
  paid_at?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  status: string;
  created_at: string;
  organization?: { name?: string } | Array<{ name?: string }> | null;
};

const DEMO_BUSINESSES: BusinessTenant[] = [
  { id: 'demo-tenant-1', name: 'Mero Construction Pvt. Ltd.', contact_email: 'office@meroconstruction.demo', plan: 'Enterprise Trial', subscription_status: 'trial', access_until: '2026-08-11', seat_limit: 25, project_limit: 5 },
  { id: 'demo-tenant-2', name: 'Himal Design Build Pvt. Ltd.', contact_email: 'admin@himaldb.demo', plan: 'Project Pro', subscription_status: 'active', access_until: '2027-07-12', seat_limit: 75, project_limit: 15 },
  { id: 'demo-tenant-3', name: 'Nepal Hydro Infrastructure Ltd.', contact_email: 'accounts@nepalhydro.demo', plan: 'Project Pro', subscription_status: 'past_due', access_until: '2026-07-05', seat_limit: 50, project_limit: 10 },
];

export default function SuperAdminDashboard() {
  const [businesses, setBusinesses] = useState<BusinessTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [openInquiries, setOpenInquiries] = useState(0);
  const [inquiries, setInquiries] = useState<BusinessInquiry[]>([]);
  const [pendingTransactions, setPendingTransactions] = useState(0);
  const [transactions, setTransactions] = useState<SubscriptionTransaction[]>([]);
  const [editing, setEditing] = useState<BusinessTenant | null>(null);
  const [saving, setSaving] = useState(false);
  const [showOnboard, setShowOnboard] = useState(false);
  const [createdLogin, setCreatedLogin] = useState<{ email: string; password: string } | null>(null);
  const [onboard, setOnboard] = useState(() => ({
    businessName: '', adminName: '', contactEmail: '', plan: 'trial',
    accessUntil: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
    seatLimit: 25, projectLimit: 5,
  }));

  const authHeaders = async (): Promise<Record<string, string>> => {
    const session = await storage.getAuthSession();
    return session ? { Authorization: `Bearer ${session.access_token}` } : {};
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch('/api/platform/overview', { headers: await authHeaders(), cache: 'no-store' });
        const result = await response.json();
        if (!active) return;
        if (!response.ok) {
          setBusinesses(process.env.NODE_ENV === 'production' ? [] : DEMO_BUSINESSES);
          setMessage(result.message || 'Showing isolated demo subscription records until the platform migration is ready.');
          return;
        }
        setBusinesses(result.businesses || []);
        setOpenInquiries(result.inquiries?.open || 0);
        setInquiries(result.inquiries?.recent || []);
        setPendingTransactions(result.transactions?.pending || 0);
        setTransactions(result.transactions?.recent || []);
      } catch {
        if (active) {
          setBusinesses(process.env.NODE_ENV === 'production' ? [] : DEMO_BUSINESSES);
          setMessage(process.env.NODE_ENV === 'production'
            ? 'The platform service is temporarily unavailable. No tenant data was substituted.'
            : 'Showing isolated demo subscription records while the platform service reconnects.');
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const summary = useMemo(() => ({
    total: businesses.length,
    active: businesses.filter(item => item.subscription_status === 'active').length,
    trial: businesses.filter(item => item.subscription_status === 'trial').length,
    attention: businesses.filter(item => ['past_due', 'suspended'].includes(item.subscription_status)).length,
  }), [businesses]);

  const saveAccess = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing || editing.id.startsWith('demo-')) {
      setMessage('Demo tenant rows are read-only. Live businesses become editable after the platform migration.');
      setEditing(null);
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/platform/overview', {
        method: 'PATCH',
        headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: editing.id,
          plan: editing.plan,
          subscriptionStatus: editing.subscription_status,
          accessUntil: editing.access_until || null,
          seatLimit: editing.seat_limit,
          projectLimit: editing.project_limit,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not update tenant access.');
      setBusinesses(rows => rows.map(item => item.id === result.business.id ? result.business : item));
      setEditing(null);
      setMessage('Business subscription access updated.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update tenant access.');
    } finally {
      setSaving(false);
    }
  };

  const updateInquiry = async (inquiryId: string, inquiryStatus: 'contacted' | 'closed') => {
    setMessage('');
    try {
      const response = await fetch('/api/platform/overview', {
        method: 'PATCH',
        headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'inquiry', inquiryId, inquiryStatus }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not update the inquiry.');
      const next = inquiries.map(item => item.id === inquiryId ? result.inquiry : item);
      setInquiries(next);
      setOpenInquiries(next.filter(item => item.status === 'new' || item.status === 'open').length);
      setMessage(`Contact request marked ${inquiryStatus}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update the inquiry.');
    }
  };

  const updateTransaction = async (transactionId: string, transactionStatus: 'verified' | 'rejected') => {
    setMessage('');
    try {
      const response = await fetch('/api/platform/overview', {
        method: 'PATCH',
        headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'transaction', transactionId, transactionStatus }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not verify the transaction.');
      const next = transactions.map(item => item.id === transactionId ? result.transaction : item);
      setTransactions(next);
      setPendingTransactions(next.filter(item => item.status === 'pending').length);
      setMessage(`Subscription transaction ${transactionStatus}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not verify the transaction.');
    }
  };

  const onboardBusiness = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/platform/overview', {
        method: 'POST',
        headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify(onboard),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not onboard the business.');
      setBusinesses(rows => [result.business, ...rows]);
      setCreatedLogin({ email: result.administrator.email, password: result.temporaryPassword });
      setShowOnboard(false);
      setOnboard({ ...onboard, businessName: '', adminName: '', contactEmail: '' });
      setMessage('Business, administrator login, trial access and initial project workspace created.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not onboard the business.');
    } finally {
      setSaving(false);
    }
  };

  return <div className="space-y-6">
    <section className="rounded-2xl border border-purple-100 bg-gradient-to-r from-white to-purple-50 p-6 shadow-sm">
      <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-bold text-purple-700">Platform owner</span>
      <h1 className="mt-3 text-2xl font-extrabold text-slate-900">BuildTrack B2B SaaS Console</h1>
      <p className="mt-1 max-w-3xl text-slate-600">Manage business onboarding, plans, trial periods and subscription verification without access to tenant projects, employees, expenses, documents or images.</p>
    </section>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Business tenants" value={loading ? '…' : String(summary.total)} />
      <Metric label="Active subscriptions" value={String(summary.active)} />
      <Metric label="Trials" value={String(summary.trial)} />
      <Metric label="Need attention" value={String(summary.attention)} warning={summary.attention > 0} />
    </section>

    {message && <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">{message}</div>}

    <section className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div><h2 className="font-bold text-slate-900">Business access register</h2><p className="text-sm text-slate-500">Subscription metadata only; tenant operational data stays private.</p></div>
          <div className="flex items-center gap-2"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">Privacy boundary enforced</span><button onClick={() => setShowOnboard(true)} className="rounded-lg bg-purple-600 px-3 py-2 text-xs font-bold text-white">+ Onboard Business</button></div>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">{['Business','Contact','Plan','Limits','Access until','Status','Action'].map(title => <th key={title} className="p-2">{title}</th>)}</tr></thead>
            <tbody>{businesses.map(business => <tr key={business.id} className="border-b border-slate-100">
              <td className="p-2 font-bold text-slate-900">{business.name}</td>
              <td className="p-2 text-slate-600">{business.contact_email || '—'}</td>
              <td className="p-2">{business.plan}</td>
              <td className="p-2 text-xs text-slate-600">{business.seat_limit || '—'} seats · {business.project_limit || '—'} projects</td>
              <td className="p-2">{business.access_until || 'No expiry'}</td>
              <td className="p-2"><Status value={business.subscription_status} /></td>
              <td className="p-2"><button onClick={() => setEditing({ ...business })} className="font-bold text-blue-700">Edit access</button></td>
            </tr>)}</tbody>
          </table>
          {!loading && businesses.length === 0 && <div className="p-8 text-center text-slate-500">No businesses have onboarded yet.</div>}
        </div>
      </div>

      <aside className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-bold text-slate-900">Platform queue</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 text-center">
            <QueueMetric label="Contact requests" value={openInquiries} />
            <QueueMetric label="Payments to verify" value={pendingTransactions} />
          </div>
          <div className="mt-3 space-y-2">{inquiries.slice(0, 5).map(item => <div key={item.id} className="rounded-lg border border-slate-100 p-3 text-xs"><div className="flex justify-between gap-2"><b className="text-slate-900">{item.business_name}</b><span className="capitalize text-amber-700">{item.status}</span></div><div className="mt-1 text-slate-600">{item.contact_name} · {item.contact_email}</div>{item.message && <p className="mt-1 line-clamp-2 text-slate-500">{item.message}</p>}{['new','open'].includes(item.status)&&<div className="mt-2 flex gap-2"><button onClick={()=>void updateInquiry(item.id,'contacted')} className="font-bold text-blue-700">Mark contacted</button><button onClick={()=>void updateInquiry(item.id,'closed')} className="font-bold text-slate-600">Close</button></div>}</div>)}{inquiries.length===0&&<p className="mt-3 text-xs text-slate-500">No contact requests yet.</p>}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-bold text-slate-900">Payment verification</h2>
          <div className="mt-3 space-y-2">{transactions.slice(0,5).map(item=>{const linked=Array.isArray(item.organization)?item.organization[0]:item.organization;return <div key={item.id} className="rounded-lg border border-slate-100 p-3 text-xs"><div className="flex justify-between gap-2"><b className="text-slate-900">{linked?.name || item.reference}</b><Status value={item.status}/></div><div className="mt-1 text-slate-600">{item.currency} {Number(item.amount).toLocaleString()} · {item.reference}</div>{item.status==='pending'&&<div className="mt-2 flex gap-2"><button onClick={()=>void updateTransaction(item.id,'verified')} className="font-bold text-emerald-700">Verify</button><button onClick={()=>void updateTransaction(item.id,'rejected')} className="font-bold text-rose-700">Reject</button></div>}</div>})}{transactions.length===0&&<p className="text-xs text-slate-500">No subscription transactions yet.</p>}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-bold text-slate-900">Pricing setup</h2>
          <div className="mt-3 space-y-2 text-sm text-slate-600">
            <div className="rounded-lg bg-slate-50 p-3"><b>Starter:</b> one active project and a small field team.</div>
            <div className="rounded-lg bg-slate-50 p-3"><b>Project Pro:</b> multi-project controls, reports and evidence.</div>
            <div className="rounded-lg bg-slate-50 p-3"><b>Enterprise:</b> larger teams, tenant branding and extended retention.</div>
          </div>
        </div>
      </aside>
    </section>

    {createdLogin && <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><div className="font-bold">New administrator login — copy this once</div><div className="mt-2 grid gap-2 sm:grid-cols-2"><code className="rounded bg-white p-2">{createdLogin.email}</code><code className="rounded bg-white p-2">{createdLogin.password}</code></div><button onClick={() => setCreatedLogin(null)} className="mt-3 text-xs font-bold text-emerald-800">I have saved the credentials</button></section>}

    {showOnboard && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <form onSubmit={onboardBusiness} className="w-full max-w-xl space-y-4 rounded-2xl bg-white p-6 shadow-2xl">
        <div><h2 className="text-lg font-bold text-slate-900">Onboard a business</h2><p className="text-sm text-slate-500">Creates an isolated tenant, Business Admin login, trial period and empty first project workspace.</p></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-slate-600">Business name<input required className="mt-1 w-full rounded-lg p-2.5" value={onboard.businessName} onChange={event => setOnboard({ ...onboard, businessName: event.target.value })} /></label>
          <label className="text-sm text-slate-600">Administrator name<input required className="mt-1 w-full rounded-lg p-2.5" value={onboard.adminName} onChange={event => setOnboard({ ...onboard, adminName: event.target.value })} /></label>
          <label className="text-sm text-slate-600">Administrator email<input required type="email" className="mt-1 w-full rounded-lg p-2.5" value={onboard.contactEmail} onChange={event => setOnboard({ ...onboard, contactEmail: event.target.value })} /></label>
          <label className="text-sm text-slate-600">Plan<select className="mt-1 w-full rounded-lg p-2.5" value={onboard.plan} onChange={event => setOnboard({ ...onboard, plan: event.target.value })}><option value="trial">Free trial</option><option value="starter">Starter</option><option value="project_pro">Project Pro</option><option value="enterprise">Enterprise</option></select></label>
          <label className="text-sm text-slate-600">Access until<input required type="date" className="mt-1 w-full rounded-lg p-2.5" value={onboard.accessUntil} onChange={event => setOnboard({ ...onboard, accessUntil: event.target.value })} /></label>
          <label className="text-sm text-slate-600">Employee seats<input required type="number" min="1" max="1000" className="mt-1 w-full rounded-lg p-2.5" value={onboard.seatLimit || ''} onChange={event => setOnboard({ ...onboard, seatLimit: Number(event.target.value) })} /></label>
          <label className="text-sm text-slate-600">Project limit<input required type="number" min="1" max="100" className="mt-1 w-full rounded-lg p-2.5" value={onboard.projectLimit || ''} onChange={event => setOnboard({ ...onboard, projectLimit: Number(event.target.value) })} /></label>
        </div>
        <div className="flex gap-2"><button disabled={saving} className="flex-1 rounded-lg bg-purple-600 px-4 py-2.5 font-bold text-white">{saving ? 'Creating tenant…' : 'Create Business & Admin'}</button><button type="button" onClick={() => setShowOnboard(false)} className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 font-bold text-slate-700">Cancel</button></div>
      </form>
    </div>}

    {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <form onSubmit={saveAccess} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl">
        <div><h2 className="text-lg font-bold text-slate-900">Edit business access</h2><p className="text-sm text-slate-500">{editing.name}</p></div>
        <label className="block text-sm text-slate-600">Plan<input className="mt-1 w-full rounded-lg p-2.5" value={editing.plan} onChange={event => setEditing({ ...editing, plan: event.target.value })} /></label>
        <label className="block text-sm text-slate-600">Status<select className="mt-1 w-full rounded-lg p-2.5" value={editing.subscription_status} onChange={event => setEditing({ ...editing, subscription_status: event.target.value })}>{['trial','active','past_due','suspended','cancelled'].map(value => <option key={value} value={value}>{value.replaceAll('_',' ')}</option>)}</select></label>
        <label className="block text-sm text-slate-600">Access until<input type="date" className="mt-1 w-full rounded-lg p-2.5" value={editing.access_until || ''} onChange={event => setEditing({ ...editing, access_until: event.target.value })} /></label>
        <div className="grid grid-cols-2 gap-3"><label className="block text-sm text-slate-600">Employee seats<input type="number" min="1" max="1000" className="mt-1 w-full rounded-lg p-2.5" value={editing.seat_limit || ''} onChange={event => setEditing({ ...editing, seat_limit: Number(event.target.value) })} /></label><label className="block text-sm text-slate-600">Project limit<input type="number" min="1" max="100" className="mt-1 w-full rounded-lg p-2.5" value={editing.project_limit || ''} onChange={event => setEditing({ ...editing, project_limit: Number(event.target.value) })} /></label></div>
        <div className="flex gap-2"><button disabled={saving} className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 font-bold text-white">{saving ? 'Saving…' : 'Save access'}</button><button type="button" onClick={() => setEditing(null)} className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 font-bold text-slate-700">Cancel</button></div>
      </form>
    </div>}
  </div>;
}

function Metric({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-xs font-bold uppercase text-slate-500">{label}</div><div className={`mt-1 text-xl font-extrabold ${warning ? 'text-amber-700' : 'text-slate-900'}`}>{value}</div></div>;
}

function QueueMetric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg bg-slate-50 p-3"><div className="text-2xl font-extrabold text-slate-900">{value}</div><div className="text-xs text-slate-500">{label}</div></div>;
}

function Status({ value }: { value: string }) {
  const attention = ['past_due', 'suspended', 'cancelled'].includes(value);
  return <span className={`rounded-full px-2 py-1 text-xs font-bold capitalize ${attention ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{value.replaceAll('_', ' ')}</span>;
}
