import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { storage } from '../lib/storage';
import BsDatePicker from './BsDatePicker';
import { addAdDays, formatBsDate, todayAdDate } from '../lib/nepaliDate';
import UploadProgress from './UploadProgress';
import { useSubmissionLock } from '../lib/useSubmissionLock';

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
  payment_method?: string | null;
  notes?: string | null;
  status: string;
  verified_at?: string | null;
  created_at: string;
  proof_storage_path?: string | null;
  proof_name?: string | null;
  organization?: { name?: string } | Array<{ name?: string }> | null;
};

type PlatformEmail = {
  connected: boolean;
  senderEmail?: string | null;
  lastSentAt?: string | null;
  queued?: number;
  failed?: number;
};

const DEMO_BUSINESSES: BusinessTenant[] = [
  { id: 'demo-tenant-1', name: 'Mero Construction Pvt. Ltd.', contact_email: 'office@meroconstruction.demo', plan: 'Enterprise Trial', subscription_status: 'trial', access_until: '2026-08-11', seat_limit: 25, project_limit: 5 },
];

const blankTransaction = () => ({
  organizationId: '', reference: '', amount: 0, currency: 'NPR', paidAt: todayAdDate(),
  periodStart: todayAdDate(), periodEnd: addAdDays(todayAdDate(), 365), paymentMethod: 'bank_transfer', notes: '',
});

export default function SuperAdminDashboard() {
  const [businesses, setBusinesses] = useState<BusinessTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [openInquiries, setOpenInquiries] = useState(0);
  const [inquiries, setInquiries] = useState<BusinessInquiry[]>([]);
  const [pendingTransactions, setPendingTransactions] = useState(0);
  const [transactions, setTransactions] = useState<SubscriptionTransaction[]>([]);
  const [email, setEmail] = useState<PlatformEmail>({ connected: false, queued: 0, failed: 0 });
  const [editing, setEditing] = useState<BusinessTenant | null>(null);
  const [saving, setSaving] = useState(false);
  const [showOnboard, setShowOnboard] = useState(false);
  const [showTransaction, setShowTransaction] = useState(false);
  const [transactionFilter, setTransactionFilter] = useState('all');
  const [transactionForm, setTransactionForm] = useState(blankTransaction);
  const [transactionProof, setTransactionProof] = useState<File | null>(null);
  const { busy: proofUploading, run: runProofUpload } = useSubmissionLock();
  const [verifying, setVerifying] = useState<{ transaction: SubscriptionTransaction; renewUntil: string } | null>(null);
  const [createdLogin, setCreatedLogin] = useState<{ email: string; password: string } | null>(null);
  const [onboard, setOnboard] = useState(() => ({
    businessName: '', adminName: '', contactEmail: '', plan: 'trial',
    accessUntil: addAdDays(todayAdDate(), 30), seatLimit: 25, projectLimit: 5,
  }));

  const authHeaders = async (): Promise<Record<string, string>> => {
    const session = await storage.getAuthSession();
    return session ? { Authorization: `Bearer ${session.access_token}` } : {};
  };

  const loadOverview = useCallback(async () => {
    try {
      const response = await fetch('/api/platform/overview', { headers: await authHeaders(), cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) {
        setBusinesses(process.env.NODE_ENV === 'production' ? [] : DEMO_BUSINESSES);
        setMessage(result.message || result.error || 'Platform subscription records are unavailable.');
        return;
      }
      setBusinesses(result.businesses || []);
      setOpenInquiries(result.inquiries?.open || 0);
      setInquiries(result.inquiries?.recent || []);
      setPendingTransactions(result.transactions?.pending || 0);
      setTransactions(result.transactions?.recent || []);
      setEmail(result.email || { connected: false, queued: 0, failed: 0 });
    } catch {
      setBusinesses(process.env.NODE_ENV === 'production' ? [] : DEMO_BUSINESSES);
      setMessage(process.env.NODE_ENV === 'production'
        ? 'The platform service is temporarily unavailable. No tenant data was substituted.'
        : 'Showing isolated demo subscription records while the platform service reconnects.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadOverview(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadOverview]);

  const summary = useMemo(() => ({
    total: businesses.length,
    active: businesses.filter(item => item.subscription_status === 'active').length,
    trial: businesses.filter(item => item.subscription_status === 'trial').length,
    attention: businesses.filter(item => ['past_due', 'suspended'].includes(item.subscription_status)).length,
  }), [businesses]);
  const visibleTransactions = useMemo(() => transactions.filter(item => transactionFilter === 'all' || item.status === transactionFilter), [transactions, transactionFilter]);

  const saveAccess = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing || editing.id.startsWith('demo-')) return;
    setSaving(true);
    try {
      const response = await fetch('/api/platform/overview', {
        method: 'PATCH', headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: editing.id, plan: editing.plan, subscriptionStatus: editing.subscription_status,
          accessUntil: editing.access_until || null, seatLimit: editing.seat_limit, projectLimit: editing.project_limit,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not update tenant access.');
      setBusinesses(rows => rows.map(item => item.id === result.business.id ? result.business : item));
      setEditing(null);
      setMessage('Business subscription access updated.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update tenant access.');
    } finally { setSaving(false); }
  };

  const updateInquiry = async (inquiryId: string, inquiryStatus: 'contacted' | 'closed') => {
    const response = await fetch('/api/platform/overview', {
      method: 'PATCH', headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'inquiry', inquiryId, inquiryStatus }),
    });
    const result = await response.json();
    if (!response.ok) return setMessage(result.error || 'Could not update the inquiry.');
    const next = inquiries.map(item => item.id === inquiryId ? result.inquiry : item);
    setInquiries(next);
    setOpenInquiries(next.filter(item => ['new', 'open'].includes(item.status)).length);
  };

  const updateTransaction = async (transaction: SubscriptionTransaction, transactionStatus: 'verified' | 'rejected', renewUntil?: string) => {
    setSaving(true);
    try {
      const response = await fetch('/api/platform/overview', {
        method: 'PATCH', headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'transaction', transactionId: transaction.id, transactionStatus, renewUntil }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not update the transaction.');
      const next = transactions.map(item => item.id === transaction.id ? result.transaction : item);
      setTransactions(next);
      setPendingTransactions(next.filter(item => item.status === 'pending').length);
      if (result.business) setBusinesses(rows => rows.map(item => item.id === result.business.id ? result.business : item));
      setVerifying(null);
      setMessage(transactionStatus === 'verified'
        ? `Payment verified and tenant access extended through ${formatBsDate(renewUntil, { long: true })}.`
        : 'Subscription transaction rejected.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update the transaction.');
    } finally { setSaving(false); }
  };

  const createTransaction = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!transactionProof) return setMessage('Upload the bank voucher or payment receipt before recording the transaction.');
    await runProofUpload(async()=>{setSaving(true);
    try {
      const proofForm = new FormData(); proofForm.set('file', transactionProof); proofForm.set('organizationId', transactionForm.organizationId);
      const proofResponse = await fetch('/api/platform/payment-proof', { method: 'POST', headers: await authHeaders(), body: proofForm });
      const proofResult = await proofResponse.json();
      if (!proofResponse.ok) throw new Error(proofResult.error || 'Could not upload the payment proof.');
      const response = await fetch('/api/platform/overview', {
        method: 'POST', headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'transaction', ...transactionForm, proofStoragePath: proofResult.storagePath, proofName: proofResult.fileName }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not record the payment transaction.');
      setTransactions(rows => [result.transaction, ...rows]);
      setPendingTransactions(value => value + 1);
      setTransactionForm(blankTransaction());
      setTransactionProof(null);
      setShowTransaction(false);
      setMessage('Payment transaction recorded and queued for verification.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not record the payment transaction.');
    } finally { setSaving(false); }});
  };

  const openPaymentProof = async (transaction: SubscriptionTransaction) => {
    if (!transaction.proof_storage_path) return setMessage('This legacy transaction has no uploaded proof.');
    const response = await fetch(`/api/platform/payment-proof?path=${encodeURIComponent(transaction.proof_storage_path)}`, { headers: await authHeaders(), cache: 'no-store' });
    const result = await response.json();
    if (!response.ok || !result.url) return setMessage(result.error || 'Could not open the payment proof.');
    window.open(result.url, '_blank', 'noopener,noreferrer');
  };

  const onboardBusiness = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch('/api/platform/overview', {
        method: 'POST', headers: { ...(await authHeaders()), 'Content-Type': 'application/json' }, body: JSON.stringify(onboard),
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
    } finally { setSaving(false); }
  };

  const connectPlatformEmail = async () => {
    const response = await fetch('/api/platform/email', { method: 'POST', headers: await authHeaders() });
    const result = await response.json();
    if (!response.ok) return setMessage(result.error || 'Could not start Gmail connection.');
    window.location.assign(result.url);
  };

  const disconnectPlatformEmail = async () => {
    if (!confirm('Disconnect the platform Gmail sender? Renewal emails will remain queued.')) return;
    const response = await fetch('/api/platform/email', { method: 'DELETE', headers: await authHeaders() });
    if (!response.ok) return setMessage('Could not disconnect the Gmail sender.');
    setEmail(current => ({ ...current, connected: false, senderEmail: null }));
  };

  const sendQueuedEmails = async () => {
    setSaving(true);
    const response = await fetch('/api/platform/overview', {
      method: 'PATCH', headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'email_queue' }),
    });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) return setMessage(result.error || 'Could not process the email queue.');
    setMessage(`Email queue processed: ${result.delivery.sent} sent, ${result.delivery.queued} waiting, ${result.delivery.failed} failed.`);
    await loadOverview();
  };

  return <div className="space-y-6"><UploadProgress active={proofUploading} label="Uploading and securing the subscription payment proof…"/>
    <section className="rounded-2xl border border-purple-100 bg-gradient-to-r from-white to-purple-50 p-6 shadow-sm">
      <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-bold text-purple-800">Platform owner</span>
      <h1 className="mt-3 text-2xl font-extrabold text-slate-950">BuildTrack B2B SaaS Console</h1>
      <p className="mt-1 max-w-3xl text-slate-700">Manage tenant access, subscription payments, renewal alerts and onboarding without access to tenant projects, employees, expenses, documents or images.</p>
    </section>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Business tenants" value={loading ? '…' : String(summary.total)} />
      <Metric label="Active subscriptions" value={String(summary.active)} />
      <Metric label="Trials" value={String(summary.trial)} />
      <Metric label="Need attention" value={String(summary.attention)} warning={summary.attention > 0} />
    </section>

    {message && <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-900">{message}</div>}

    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div><h2 className="font-bold text-slate-950">Business access register</h2><p className="text-sm text-slate-600">Subscription metadata only; tenant operational data stays private.</p></div>
          <button onClick={() => setShowOnboard(true)} className="rounded-lg bg-purple-700 px-3 py-2 text-xs font-bold text-white">+ Onboard Business</button>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-600">{['Business','Contact','Plan','Limits','Access until (BS)','Status','Action'].map(title => <th key={title} className="p-2">{title}</th>)}</tr></thead>
            <tbody>{businesses.map(business => <tr key={business.id} className="border-b border-slate-100">
              <td className="p-2 font-bold text-slate-950">{business.name}</td><td className="p-2 text-slate-700">{business.contact_email || '—'}</td>
              <td className="p-2 text-slate-800">{business.plan}</td><td className="p-2 text-xs text-slate-700">{business.seat_limit || '—'} seats · {business.project_limit || '—'} projects</td>
              <td className="p-2 font-semibold text-slate-800">{business.access_until ? formatBsDate(business.access_until) : 'No expiry'}</td>
              <td className="p-2"><Status value={business.subscription_status} /></td><td className="p-2"><button onClick={() => setEditing({ ...business })} className="font-bold text-blue-800">Edit / extend</button></td>
            </tr>)}</tbody>
          </table>
          {!loading && businesses.length === 0 && <div className="p-8 text-center text-slate-600">No businesses have onboarded yet.</div>}
        </div>
      </div>

      <aside className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-bold text-slate-950">Platform queue</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 text-center"><QueueMetric label="Contact requests" value={openInquiries} /><QueueMetric label="Payments to verify" value={pendingTransactions} /></div>
          <div className="mt-3 space-y-2">{inquiries.slice(0, 5).map(item => <div key={item.id} className="rounded-lg border border-slate-200 p-3 text-xs"><div className="flex justify-between gap-2"><b className="text-slate-950">{item.business_name}</b><span className="capitalize text-amber-800">{item.status}</span></div><div className="mt-1 text-slate-700">{item.contact_name} · {item.contact_email}</div>{item.message && <p className="mt-1 line-clamp-2 text-slate-600">{item.message}</p>}{['new','open'].includes(item.status)&&<div className="mt-2 flex gap-2"><button onClick={()=>void updateInquiry(item.id,'contacted')} className="font-bold text-blue-800">Mark contacted</button><button onClick={()=>void updateInquiry(item.id,'closed')} className="font-bold text-slate-700">Close</button></div>}</div>)}{inquiries.length===0&&<p className="mt-3 text-xs text-slate-600">No contact requests yet.</p>}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2"><div><h2 className="font-bold text-slate-950">Renewal email sender</h2><p className="text-xs text-slate-600">Automatic T-5, T-3, T-1 and expiry-day alerts.</p></div><Status value={email.connected ? 'connected' : 'not_connected'} /></div>
          {email.connected ? <div className="mt-3 text-sm"><div className="font-semibold text-slate-800">{email.senderEmail}</div><div className="mt-1 text-xs text-slate-600">Queued: {email.queued || 0} · Failed: {email.failed || 0}</div><div className="mt-3 flex gap-3"><button disabled={saving} onClick={()=>void sendQueuedEmails()} className="font-bold text-blue-800">Send queued now</button><button onClick={()=>void disconnectPlatformEmail()} className="font-bold text-rose-800">Disconnect Gmail</button></div></div> : <button onClick={()=>void connectPlatformEmail()} className="mt-3 w-full rounded-lg bg-blue-700 px-3 py-2 font-bold text-white">Connect platform Gmail</button>}
        </div>
      </aside>
    </section>

    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="font-bold text-slate-950">Subscription transaction register</h2><p className="text-sm text-slate-600">Record every receipt, verify it, and extend the tenant validity period in one controlled action.</p></div><div className="flex gap-2"><select value={transactionFilter} onChange={event => setTransactionFilter(event.target.value)} className="rounded-lg px-3 py-2"><option value="all">All transactions</option>{['pending','verified','rejected','refunded'].map(value => <option key={value} value={value}>{value}</option>)}</select><button onClick={() => setShowTransaction(true)} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white">+ Record payment</button></div></div>
      <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[1150px] text-sm"><thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-600">{['Business','Reference','Amount','Paid date (BS)','Subscription period (BS)','Method','Proof','Status','Verified','Action'].map(title=><th key={title} className="p-2">{title}</th>)}</tr></thead><tbody>{visibleTransactions.map(item=>{const linked=Array.isArray(item.organization)?item.organization[0]:item.organization;return <tr key={item.id} className="border-b border-slate-100"><td className="p-2 font-bold text-slate-950">{linked?.name || businesses.find(row=>row.id===item.organization_id)?.name || 'Tenant'}</td><td className="p-2 font-mono text-slate-800">{item.reference}</td><td className="p-2 font-bold">{item.currency} {Number(item.amount).toLocaleString()}</td><td className="p-2">{formatBsDate(item.paid_at?.slice(0,10))}</td><td className="p-2">{formatBsDate(item.period_start)} → {formatBsDate(item.period_end)}</td><td className="p-2 capitalize">{item.payment_method?.replaceAll('_',' ') || '—'}</td><td className="p-2">{item.proof_storage_path?<button onClick={()=>void openPaymentProof(item)} className="font-bold text-blue-800">View proof</button>:<span className="font-bold text-rose-800">Missing</span>}</td><td className="p-2"><Status value={item.status}/></td><td className="p-2">{item.verified_at ? formatBsDate(item.verified_at.slice(0,10)) : '—'}</td><td className="p-2">{item.status==='pending'&&<div className="flex gap-2"><button onClick={()=>setVerifying({transaction:item,renewUntil:item.period_end||addAdDays(todayAdDate(),365)})} className="font-bold text-emerald-800">Verify & extend</button><button onClick={()=>void updateTransaction(item,'rejected')} className="font-bold text-rose-800">Reject</button></div>}</td></tr>})}</tbody></table>{visibleTransactions.length===0&&<div className="p-8 text-center text-slate-600">No transactions match this filter.</div>}</div>
    </section>

    {createdLogin && <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"><div className="font-bold">New administrator login — copy this once</div><div className="mt-2 grid gap-2 sm:grid-cols-2"><code className="rounded bg-white p-2">{createdLogin.email}</code><code className="rounded bg-white p-2">{createdLogin.password}</code></div><button onClick={() => setCreatedLogin(null)} className="mt-3 text-xs font-bold text-emerald-900">I have saved the credentials</button></section>}

    {showTransaction && <Modal><form onSubmit={createTransaction} className="w-full max-w-2xl space-y-4 rounded-2xl bg-white p-6 shadow-2xl"><ModalTitle title="Record subscription payment" subtitle="The transaction remains pending until it is verified. Verification can extend tenant access automatically." /><div className="grid gap-3 sm:grid-cols-2"><Field label="Business"><select required value={transactionForm.organizationId} onChange={event=>setTransactionForm({...transactionForm,organizationId:event.target.value})}><option value="">Choose tenant</option>{businesses.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="Payment reference"><input required value={transactionForm.reference} onChange={event=>setTransactionForm({...transactionForm,reference:event.target.value})} placeholder="Bank voucher / transaction ID" /></Field><Field label="Amount"><input required type="number" min="0.01" step="0.01" value={transactionForm.amount || ''} onChange={event=>setTransactionForm({...transactionForm,amount:Number(event.target.value)})}/></Field><Field label="Currency"><input required maxLength={3} value={transactionForm.currency} onChange={event=>setTransactionForm({...transactionForm,currency:event.target.value.toUpperCase()})}/></Field><Field label="Payment date (BS)"><BsDatePicker required value={transactionForm.paidAt} onChange={paidAt=>setTransactionForm({...transactionForm,paidAt})}/></Field><Field label="Payment method"><select value={transactionForm.paymentMethod} onChange={event=>setTransactionForm({...transactionForm,paymentMethod:event.target.value})}>{['bank_transfer','cheque','cash','other'].map(value=><option key={value} value={value}>{value.replaceAll('_',' ')}</option>)}</select></Field><Field label="Period starts (BS)"><BsDatePicker value={transactionForm.periodStart} onChange={periodStart=>setTransactionForm({...transactionForm,periodStart})}/></Field><Field label="Period ends / renew until (BS)"><BsDatePicker required value={transactionForm.periodEnd} onChange={periodEnd=>setTransactionForm({...transactionForm,periodEnd})}/></Field><Field label="Bank Voucher / Payment Receipt"><input required type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={event=>setTransactionProof(event.target.files?.[0]||null)}/></Field></div><Field label="Notes"><textarea value={transactionForm.notes} onChange={event=>setTransactionForm({...transactionForm,notes:event.target.value})} placeholder="Plan, invoice, payer, reconciliation or other details" /></Field><ModalActions saving={saving||proofUploading} primary="Save pending transaction" onCancel={()=>setShowTransaction(false)}/></form></Modal>}

    {showOnboard && <Modal><form onSubmit={onboardBusiness} className="w-full max-w-xl space-y-4 rounded-2xl bg-white p-6 shadow-2xl"><ModalTitle title="Onboard a business" subtitle="Creates an isolated tenant, Business Admin login, trial period and first project workspace." /><div className="grid gap-3 sm:grid-cols-2"><Field label="Business name"><input required value={onboard.businessName} onChange={event=>setOnboard({...onboard,businessName:event.target.value})}/></Field><Field label="Administrator name"><input required value={onboard.adminName} onChange={event=>setOnboard({...onboard,adminName:event.target.value})}/></Field><Field label="Administrator email"><input required type="email" value={onboard.contactEmail} onChange={event=>setOnboard({...onboard,contactEmail:event.target.value})}/></Field><Field label="Plan"><select value={onboard.plan} onChange={event=>setOnboard({...onboard,plan:event.target.value})}><option value="trial">Free trial</option><option value="starter">Starter</option><option value="project_pro">Project Pro</option><option value="enterprise">Enterprise</option></select></Field><Field label="Access until (BS)"><BsDatePicker required value={onboard.accessUntil} onChange={accessUntil=>setOnboard({...onboard,accessUntil})}/></Field><Field label="Employee seats"><input required type="number" min="1" max="1000" value={onboard.seatLimit||''} onChange={event=>setOnboard({...onboard,seatLimit:Number(event.target.value)})}/></Field><Field label="Project limit"><input required type="number" min="1" max="100" value={onboard.projectLimit||''} onChange={event=>setOnboard({...onboard,projectLimit:Number(event.target.value)})}/></Field></div><ModalActions saving={saving} primary="Create Business & Admin" onCancel={()=>setShowOnboard(false)}/></form></Modal>}

    {editing && <Modal><form onSubmit={saveAccess} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl"><ModalTitle title="Edit business access" subtitle={editing.name}/><Field label="Plan"><input value={editing.plan} onChange={event=>setEditing({...editing,plan:event.target.value})}/></Field><Field label="Status"><select value={editing.subscription_status} onChange={event=>setEditing({...editing,subscription_status:event.target.value})}>{['trial','active','past_due','suspended','cancelled'].map(value=><option key={value} value={value}>{value.replaceAll('_',' ')}</option>)}</select></Field><Field label="Access until (BS)"><BsDatePicker value={editing.access_until||''} onChange={access_until=>setEditing({...editing,access_until})}/><div className="mt-2 flex flex-wrap gap-2">{[30,90,365].map(days=><button key={days} type="button" onClick={()=>setEditing({...editing,access_until:addAdDays(editing.access_until&&editing.access_until>todayAdDate()?editing.access_until:todayAdDate(),days)})} className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-bold text-blue-800">+{days} days</button>)}</div></Field><div className="grid grid-cols-2 gap-3"><Field label="Employee seats"><input type="number" min="1" max="1000" value={editing.seat_limit||''} onChange={event=>setEditing({...editing,seat_limit:Number(event.target.value)})}/></Field><Field label="Project limit"><input type="number" min="1" max="100" value={editing.project_limit||''} onChange={event=>setEditing({...editing,project_limit:Number(event.target.value)})}/></Field></div><ModalActions saving={saving} primary="Save access" onCancel={()=>setEditing(null)}/></form></Modal>}

    {verifying && <Modal><form onSubmit={event=>{event.preventDefault();void updateTransaction(verifying.transaction,'verified',verifying.renewUntil);}} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl"><ModalTitle title="Verify payment and extend access" subtitle={`${verifying.transaction.currency} ${Number(verifying.transaction.amount).toLocaleString()} · ${verifying.transaction.reference}`}/><Field label="Tenant access until (BS)"><BsDatePicker required value={verifying.renewUntil} onChange={renewUntil=>setVerifying({...verifying,renewUntil})}/></Field><p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-950">This marks the payment verified, activates the tenant, updates all project validity dates, creates a tenant dashboard notification, and queues a confirmation email.</p><ModalActions saving={saving} primary="Verify & extend access" onCancel={()=>setVerifying(null)}/></form></Modal>}
  </div>;
}

function Metric({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) { return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-xs font-bold uppercase text-slate-600">{label}</div><div className={`mt-1 text-xl font-extrabold ${warning?'text-amber-800':'text-slate-950'}`}>{value}</div></div>; }
function QueueMetric({ label, value }: { label: string; value: number }) { return <div className="rounded-lg bg-slate-50 p-3"><div className="text-2xl font-extrabold text-slate-950">{value}</div><div className="text-xs text-slate-600">{label}</div></div>; }
function Status({ value }: { value: string }) { const attention=['past_due','suspended','cancelled','rejected','not_connected'].includes(value);const pending=value==='pending';return <span className={`rounded-full px-2 py-1 text-xs font-bold capitalize ${attention?'bg-rose-50 text-rose-800':pending?'bg-amber-50 text-amber-800':'bg-emerald-50 text-emerald-800'}`}>{value.replaceAll('_',' ')}</span>; }
function Modal({ children }: { children: React.ReactNode }) { return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/55 p-4">{children}</div>; }
function ModalTitle({ title, subtitle }: { title: string; subtitle: string }) { return <div><h2 className="text-lg font-bold text-slate-950">{title}</h2><p className="text-sm text-slate-600">{subtitle}</p></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-sm font-semibold text-slate-700">{label}<div className="mt-1">{children}</div></label>; }
function ModalActions({ saving, primary, onCancel }: { saving: boolean; primary: string; onCancel: () => void }) { return <div className="flex gap-2"><button disabled={saving} className="flex-1 rounded-lg bg-blue-700 px-4 py-2.5 font-bold text-white disabled:opacity-60">{saving?'Saving…':primary}</button><button type="button" onClick={onCancel} className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 font-bold text-slate-800">Cancel</button></div>; }
