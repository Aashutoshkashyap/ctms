'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { storage } from '../lib/storage';
import { formatBsDate, replaceAdDatesWithBs } from '../lib/nepaliDate';

type Transaction = {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  paid_at?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  payment_method?: string | null;
  status: string;
  verified_at?: string | null;
};

type SubscriptionStatus = {
  organization: { name: string; plan: string; subscription_status: string; access_until?: string | null };
  daysRemaining: number | null;
  notifications: Array<{ id: string; title: string; message: string; severity: string; created_at: string }>;
  transactions: Transaction[];
};

export default function SubscriptionDashboard() {
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const session = await storage.getAuthSession();
        if (!session) throw new Error('Sign in to view subscription details.');
        const response = await fetch('/api/subscription/status', {
          headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store',
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not load service details.');
        if (active) setStatus(result);
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : 'Could not load service details.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const totalPaid = useMemo(() => (status?.transactions || [])
    .filter(item => item.status === 'verified')
    .reduce((sum, item) => sum + Number(item.amount || 0), 0), [status]);

  if (loading) return <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-600">Loading service and billing history…</div>;
  if (!status) return <div className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-rose-900">{message}</div>;
  const valid = status.daysRemaining === null || status.daysRemaining >= 0;

  return <div className="space-y-5">
    <section className="rounded-2xl border border-blue-100 bg-gradient-to-r from-white to-blue-50 p-6 shadow-sm">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div><span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800">Tenant service account</span><h1 className="mt-3 text-2xl font-extrabold text-slate-950">Service & Billing</h1><p className="mt-1 text-slate-600">Subscription validity, renewal periods, payment verification and service alerts in one place.</p></div>
        <Status value={status.organization.subscription_status} />
      </div>
    </section>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Business" value={status.organization.name}/>
      <Metric label="Plan" value={status.organization.plan.replaceAll('_',' ')}/>
      <Metric label="Valid until (BS)" value={formatBsDate(status.organization.access_until, { long: true })}/>
      <Metric label="Service remaining" value={status.daysRemaining === null ? 'No fixed expiry' : valid ? `${status.daysRemaining} day(s)` : 'Expired'} warning={!valid}/>
    </section>

    {status.notifications.length > 0 && <section className="rounded-xl border border-amber-200 bg-amber-50 p-4"><h2 className="font-bold text-slate-950">Service alerts</h2><div className="mt-3 grid gap-2 md:grid-cols-2">{status.notifications.map(item=><div key={item.id} className="rounded-lg border border-amber-100 bg-white p-3 text-sm"><b>{item.title}</b><p className="mt-1 text-slate-700">{replaceAdDatesWithBs(item.message)}</p></div>)}</div></section>}

    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end"><div><h2 className="font-bold text-slate-950">Purchase and renewal history</h2><p className="text-sm text-slate-600">Verified payments activate the stated service period. Pending payments do not extend access until the platform administrator verifies them.</p></div><div className="text-sm font-bold text-emerald-800">Verified total: NPR {totalPaid.toLocaleString()}</div></div>
      <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-600">{['Reference','Paid date (BS)','Amount','Service period (BS)','Method','Status','Verified (BS)'].map(title=><th key={title} className="p-3">{title}</th>)}</tr></thead><tbody>{status.transactions.map(item=><tr key={item.id} className="border-b border-slate-100"><td className="p-3 font-mono font-bold text-slate-800">{item.reference}</td><td className="p-3">{formatBsDate(item.paid_at?.slice(0,10))}</td><td className="p-3 font-bold">{item.currency} {Number(item.amount).toLocaleString()}</td><td className="p-3">{formatBsDate(item.period_start)} → {formatBsDate(item.period_end)}</td><td className="p-3 capitalize">{item.payment_method?.replaceAll('_',' ') || '—'}</td><td className="p-3"><Status value={item.status}/></td><td className="p-3">{formatBsDate(item.verified_at?.slice(0,10))}</td></tr>)}</tbody></table>{status.transactions.length===0&&<div className="p-8 text-center text-slate-600">No subscription transactions have been recorded yet.</div>}</div>
    </section>

    <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700"><h2 className="font-bold text-slate-950">Renewal terms</h2><ul className="mt-2 list-disc space-y-1 pl-5"><li>Renewal reminders are issued 5, 3 and 1 day before expiry and again on the expiry day.</li><li>Send the bank or payment reference to the platform administrator for verification.</li><li>Project data remains tenant-isolated during renewal processing; the platform administrator sees billing metadata only.</li><li>Access dates change only after a verified payment or an authorized manual extension.</li></ul></section>
  </div>;
}

function Metric({label,value,warning=false}:{label:string;value:string;warning?:boolean}){return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-xs font-bold uppercase text-slate-600">{label}</div><div className={`mt-1 font-extrabold capitalize ${warning?'text-rose-800':'text-slate-950'}`}>{value}</div></div>}
function Status({value}:{value:string}){const bad=['past_due','suspended','cancelled','expired','rejected'].includes(value);const pending=value==='pending';return <span className={`inline-flex h-fit rounded-full px-3 py-1 text-xs font-bold capitalize ${bad?'bg-rose-100 text-rose-900':pending?'bg-amber-100 text-amber-900':'bg-emerald-100 text-emerald-900'}`}>{value.replaceAll('_',' ')}</span>}
