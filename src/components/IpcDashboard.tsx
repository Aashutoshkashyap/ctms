import React, { useMemo, useRef, useState } from 'react';
import { IpcEntry, IpcPayment, storage } from '../lib/storage';
import BsDatePicker from './BsDatePicker';
import { formatBsDate, todayAdDate } from '../lib/nepaliDate';
import UploadProgress from './UploadProgress';
import { calculateIpcFinancialSummary, calculateIpcOutstanding } from '../lib/financialMetrics';

interface Props {
  ipcSubmissions: IpcEntry[];
  userRole: string;
  userName: string;
  userEmail: string;
  onRefresh: () => void;
}

export default function IpcDashboard({ ipcSubmissions, userRole, userName, userEmail, onRefresh }: Props) {
  const [showClaim, setShowClaim] = useState(false);
  const [selectedIpc, setSelectedIpc] = useState<IpcEntry | null>(null);
  const [payIpc, setPayIpc] = useState<IpcEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const uploadLock = useRef(false);
  const [message, setMessage] = useState('');
  const [claimFile, setClaimFile] = useState<File | null>(null);
  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [paymentProof, setPaymentProof] = useState<File | null>(null);
  const [payments, setPayments] = useState<IpcPayment[]>(() => storage.getIPCPayments());
  const [claim, setClaim] = useState(() => ({
    ipc_number: ipcSubmissions.length + 1, claimed_amount: 0, submitted_date: todayAdDate(),
    billing_period_start: todayAdDate(), billing_period_end: todayAdDate(), invoice_reference: '', claim_remarks: '',
  }));
  const [certification, setCertification] = useState({
    certified_amount: 0, retention_deducted: 0, advance_recovered: 0, certified_date: todayAdDate(),
    certificate_reference: '', certified_by: '', certification_remarks: '',
  });
  const [payment, setPayment] = useState({
    payment_date: todayAdDate(), amount: 0, tax_deducted: 0, payment_method: 'bank_transfer' as IpcPayment['payment_method'],
    bank_reference: '', paid_by: '', received_in_account: '', remarks: '',
  });

  const canSubmit = ['project_director', 'project_manager', 'qs_billing_engineer'].includes(userRole);
  const canCertify = userRole === 'project_director';
  const canPay = ['project_director', 'accountant'].includes(userRole);
  const totals = useMemo(() => calculateIpcFinancialSummary(ipcSubmissions), [ipcSubmissions]);

  const submitClaim = async (event: React.FormEvent) => {
    event.preventDefault();
    if (claim.claimed_amount <= 0 || !claim.invoice_reference.trim() || !claimFile) return setMessage('Claim amount, invoice reference and IPC claim document are required.');
    if (claim.billing_period_end < claim.billing_period_start) return setMessage('Billing period end cannot be before its start.');
    if (uploadLock.current) return;
    uploadLock.current = true; setSaving(true);
    try {
      const id = `ipc-${Date.now()}`;
      const uploaded = await storage.uploadProjectDocument(claimFile, 'ipc_claim', id, userName, `IPC ${claim.ipc_number} claim`);
      storage.submitIPC({
        id, ...claim, claim_document_path: uploaded.storage_path || '', claim_document_url: uploaded.url || '',
      });
      setClaim({ ...claim, ipc_number: claim.ipc_number + 1, claimed_amount: 0, invoice_reference: '', claim_remarks: '' });
      setClaimFile(null); setShowClaim(false); setMessage('IPC claim and supporting document recorded.'); onRefresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not submit the IPC claim.'); }
    finally { uploadLock.current = false; setSaving(false); }
  };

  const beginCertification = (ipc: IpcEntry) => {
    const suggested = Number(ipc.claimed_amount || 0) * 0.9;
    setSelectedIpc(ipc);
    setCertification({
      certified_amount: suggested, retention_deducted: suggested * 0.1, advance_recovered: 0,
      certified_date: todayAdDate(), certificate_reference: '', certified_by: userName, certification_remarks: '',
    });
    setCertificateFile(null);
  };

  const certify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedIpc || certification.certified_amount <= 0 || !certification.certificate_reference.trim() || !certification.certified_by.trim() || !certificateFile) {
      return setMessage('Certified amount, certificate reference, certifier and certificate file are required.');
    }
    if (uploadLock.current) return;
    uploadLock.current = true; setSaving(true);
    try {
      const uploaded = await storage.uploadProjectDocument(certificateFile, 'ipc_certificate', selectedIpc.id, userName, `IPC ${selectedIpc.ipc_number} certificate`);
      storage.certifyIPC(selectedIpc.id, {
        ...certification, certificate_document_path: uploaded.storage_path || '', certificate_document_url: uploaded.url || '',
      });
      setSelectedIpc(null); setCertificateFile(null); setMessage('IPC certification and certificate evidence recorded.'); onRefresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not certify the IPC.'); }
    finally { uploadLock.current = false; setSaving(false); }
  };

  const beginPayment = (ipc: IpcEntry) => {
    const outstanding = calculateIpcOutstanding(ipc);
    setPayIpc(ipc); setPayment({ payment_date: todayAdDate(), amount: outstanding, tax_deducted: 0, payment_method: 'bank_transfer', bank_reference: '', paid_by: '', received_in_account: '', remarks: '' }); setPaymentProof(null);
  };

  const recordPayment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!payIpc || payment.amount <= 0 || !payment.bank_reference.trim() || !payment.paid_by.trim() || !payment.received_in_account.trim() || !paymentProof) {
      return setMessage('Payment amount, bank/reference number, payer, receiving account and proof are required.');
    }
    if (uploadLock.current) return;
    uploadLock.current = true; setSaving(true);
    try {
      const saved = await storage.recordIPCPayment({ ...payment, ipc_id: payIpc.id, recorded_by: userName, recorded_by_email: userEmail }, paymentProof);
      setPayments(rows => [saved, ...rows]); setPayIpc(null); setPaymentProof(null); setMessage('IPC payment and bank proof recorded without overwriting earlier part-payments.'); onRefresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not record the IPC payment.'); }
    finally { uploadLock.current = false; setSaving(false); }
  };

  return <div className="space-y-5"><UploadProgress active={saving} label="Uploading and securing the IPC document…"/>
    <div className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center"><div><h2 className="text-base font-bold text-slate-950">Interim Payment Certificates</h2><p className="text-sm text-slate-600">Auditable claims, certificates, partial payments, bank references and private proof files.</p></div>{canSubmit&&<button onClick={()=>setShowClaim(value=>!value)} className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-bold text-white">+ Submit IPC claim</button>}</div>
    <div className="grid gap-3 sm:grid-cols-3"><Metric label="Claimed" value={totals.claimedAmount}/><Metric label="Certified" value={totals.certifiedAmount}/><Metric label="Payments received" value={totals.paidAmount}/></div>
    {message&&<div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-950">{message}</div>}

    {showClaim&&<form onSubmit={submitClaim} className="rounded-xl border border-blue-200 bg-white p-5 shadow-sm"><FormTitle title="Submit IPC claim" subtitle="Required fields are marked by browser validation; the claim file is mandatory."/><div className="mt-4 grid gap-3 md:grid-cols-3"><Field label="IPC number"><input required type="number" min="1" value={claim.ipc_number||''} onChange={event=>setClaim({...claim,ipc_number:Number(event.target.value)})}/></Field><Field label="Invoice / claim reference"><input required value={claim.invoice_reference} onChange={event=>setClaim({...claim,invoice_reference:event.target.value})}/></Field><Field label="Claimed amount (NPR)"><input required type="number" min="0.01" step="0.01" value={claim.claimed_amount||''} onChange={event=>setClaim({...claim,claimed_amount:Number(event.target.value)})}/></Field><Field label="Billing period start (BS)"><BsDatePicker required value={claim.billing_period_start} onChange={billing_period_start=>setClaim({...claim,billing_period_start})}/></Field><Field label="Billing period end (BS)"><BsDatePicker required value={claim.billing_period_end} onChange={billing_period_end=>setClaim({...claim,billing_period_end})}/></Field><Field label="Submitted date (BS)"><BsDatePicker required value={claim.submitted_date} onChange={submitted_date=>setClaim({...claim,submitted_date})}/></Field><Field label="IPC claim file"><input required type="file" accept="application/pdf,image/*" onChange={event=>setClaimFile(event.target.files?.[0]||null)}/></Field><Field label="Remarks"><textarea value={claim.claim_remarks} onChange={event=>setClaim({...claim,claim_remarks:event.target.value})}/></Field></div><Actions saving={saving} primary="Save claim & document" cancel={()=>setShowClaim(false)}/></form>}

    {selectedIpc&&<form onSubmit={certify} className="rounded-xl border border-purple-200 bg-white p-5 shadow-sm"><FormTitle title={`Certify IPC #${selectedIpc.ipc_number}`} subtitle="Record the formal certificate and all commercial deductions."/><div className="mt-4 grid gap-3 md:grid-cols-3"><Field label="Gross certified amount"><input required type="number" min="0.01" value={certification.certified_amount||''} onChange={event=>setCertification({...certification,certified_amount:Number(event.target.value)})}/></Field><Field label="Retention deduction"><input type="number" min="0" value={certification.retention_deducted||''} onChange={event=>setCertification({...certification,retention_deducted:Number(event.target.value)})}/></Field><Field label="Advance recovery"><input type="number" min="0" value={certification.advance_recovered||''} onChange={event=>setCertification({...certification,advance_recovered:Number(event.target.value)})}/></Field><Field label="Certificate reference"><input required value={certification.certificate_reference} onChange={event=>setCertification({...certification,certificate_reference:event.target.value})}/></Field><Field label="Certified by"><input required value={certification.certified_by} onChange={event=>setCertification({...certification,certified_by:event.target.value})}/></Field><Field label="Certification date (BS)"><BsDatePicker required value={certification.certified_date} onChange={certified_date=>setCertification({...certification,certified_date})}/></Field><Field label="Certificate file"><input required type="file" accept="application/pdf,image/*" onChange={event=>setCertificateFile(event.target.files?.[0]||null)}/></Field><Field label="Certification remarks"><textarea value={certification.certification_remarks} onChange={event=>setCertification({...certification,certification_remarks:event.target.value})}/></Field></div><div className="mt-3 rounded-lg bg-slate-50 p-3 font-bold text-slate-800">Net payable: NPR {(certification.certified_amount-certification.retention_deducted-certification.advance_recovered).toLocaleString()}</div><Actions saving={saving} primary="Verify certificate" cancel={()=>setSelectedIpc(null)}/></form>}

    {payIpc&&<form onSubmit={recordPayment} className="rounded-xl border border-emerald-200 bg-white p-5 shadow-sm"><FormTitle title={`Record IPC #${payIpc.ipc_number} payment`} subtitle="Each part-payment is preserved as a separate bank transaction."/><div className="mt-4 grid gap-3 md:grid-cols-3"><Field label="Payment date (BS)"><BsDatePicker required value={payment.payment_date} onChange={payment_date=>setPayment({...payment,payment_date})}/></Field><Field label="Amount received"><input required type="number" min="0.01" step="0.01" value={payment.amount||''} onChange={event=>setPayment({...payment,amount:Number(event.target.value)})}/></Field><Field label="Tax deducted"><input type="number" min="0" step="0.01" value={payment.tax_deducted||''} onChange={event=>setPayment({...payment,tax_deducted:Number(event.target.value)})}/></Field><Field label="Payment method"><select value={payment.payment_method} onChange={event=>setPayment({...payment,payment_method:event.target.value as IpcPayment['payment_method']})}>{['bank_transfer','cheque','cash','other'].map(value=><option key={value} value={value}>{value.replaceAll('_',' ')}</option>)}</select></Field><Field label="Bank / transaction reference"><input required value={payment.bank_reference} onChange={event=>setPayment({...payment,bank_reference:event.target.value})}/></Field><Field label="Paid by"><input required value={payment.paid_by} onChange={event=>setPayment({...payment,paid_by:event.target.value})} placeholder="Employer / Client"/></Field><Field label="Received in account"><input required value={payment.received_in_account} onChange={event=>setPayment({...payment,received_in_account:event.target.value})}/></Field><Field label="Payment proof"><input required type="file" accept="application/pdf,image/*" onChange={event=>setPaymentProof(event.target.files?.[0]||null)}/></Field><Field label="Remarks"><textarea value={payment.remarks} onChange={event=>setPayment({...payment,remarks:event.target.value})}/></Field></div><Actions saving={saving} primary="Record payment & proof" cancel={()=>setPayIpc(null)}/></form>}

    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><h3 className="font-bold text-slate-950">IPC register</h3><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[1100px] text-sm"><thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-600">{['IPC','Period (BS)','Claim reference','Claimed','Certified','Retention','Advance recovery','Paid','Status','Evidence','Action'].map(value=><th key={value} className="p-2">{value}</th>)}</tr></thead><tbody>{ipcSubmissions.map(ipc=><tr key={ipc.id} className="border-b border-slate-100"><td className="p-2 font-bold text-slate-950">IPC #{ipc.ipc_number}<div className="text-xs font-normal text-slate-600">{formatBsDate(ipc.submitted_date)}</div></td><td className="p-2">{formatBsDate(ipc.billing_period_start)} → {formatBsDate(ipc.billing_period_end)}</td><td className="p-2 font-mono">{ipc.invoice_reference||'—'}</td><Money value={ipc.claimed_amount}/><Money value={ipc.certified_amount}/><Money value={ipc.retention_deducted}/><Money value={ipc.advance_recovered}/><Money value={ipc.paid_amount}/><td className="p-2"><Status value={ipc.status}/></td><td className="p-2 text-xs"><Evidence ok={Boolean(ipc.claim_document_path)} label="Claim"/><Evidence ok={Boolean(ipc.certificate_document_path)} label="Certificate"/><Evidence ok={payments.some(item=>item.ipc_id===ipc.id&&item.proof_storage_path)} label="Payment"/></td><td className="p-2"><div className="flex gap-2">{ipc.status==='pending'&&canCertify&&<button onClick={()=>beginCertification(ipc)} className="font-bold text-purple-800">Certify</button>}{['certified','partially_paid'].includes(ipc.status)&&canPay&&<button onClick={()=>beginPayment(ipc)} className="font-bold text-emerald-800">Add payment</button>}</div></td></tr>)}</tbody></table></div></div>
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><h3 className="font-bold text-slate-950">IPC payment history</h3><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-600">{['Payment date (BS)','IPC','Reference','Paid by','Account','Method','Tax','Amount','Proof'].map(value=><th key={value} className="p-2">{value}</th>)}</tr></thead><tbody>{payments.map(item=><tr key={item.id} className="border-b border-slate-100"><td className="p-2">{formatBsDate(item.payment_date)}</td><td className="p-2 font-bold">#{ipcSubmissions.find(ipc=>ipc.id===item.ipc_id)?.ipc_number||'—'}</td><td className="p-2 font-mono">{item.bank_reference}</td><td className="p-2">{item.paid_by||'—'}</td><td className="p-2">{item.received_in_account||'—'}</td><td className="p-2 capitalize">{item.payment_method.replaceAll('_',' ')}</td><Money value={item.tax_deducted}/><Money value={item.amount}/><td className="p-2"><Evidence ok={Boolean(item.proof_storage_path)} label="Stored"/></td></tr>)}</tbody></table>{payments.length===0&&<div className="p-8 text-center text-slate-600">No IPC payments recorded.</div>}</div></div>
  </div>;
}

function Metric({label,value}:{label:string;value:number}){return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-xs font-bold uppercase text-slate-600">{label}</div><div className="mt-1 text-xl font-extrabold text-slate-950">NPR {value.toLocaleString()}</div></div>}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="text-sm font-semibold text-slate-700">{label}<div className="mt-1">{children}</div></label>}
function FormTitle({title,subtitle}:{title:string;subtitle:string}){return <div><h3 className="font-bold text-slate-950">{title}</h3><p className="text-sm text-slate-600">{subtitle}</p></div>}
function Actions({saving,primary,cancel}:{saving:boolean;primary:string;cancel:()=>void}){return <div className="mt-4 flex gap-2"><button disabled={saving} className="rounded-lg bg-blue-700 px-4 py-2 font-bold text-white disabled:opacity-60">{saving?'Saving…':primary}</button><button type="button" onClick={cancel} className="rounded-lg border border-slate-300 px-4 py-2 font-bold text-slate-800">Cancel</button></div>}
function Money({value}:{value:number}){return <td className="p-2 text-right font-mono font-semibold">{Number(value||0).toLocaleString()}</td>}
function Status({value}:{value:string}){const paid=value==='paid';const pending=value==='pending';return <span className={`rounded-full px-2 py-1 text-xs font-bold capitalize ${paid?'bg-emerald-50 text-emerald-800':pending?'bg-amber-50 text-amber-800':'bg-blue-50 text-blue-800'}`}>{value.replaceAll('_',' ')}</span>}
function Evidence({ok,label}:{ok:boolean;label:string}){return <div className={ok?'text-emerald-800':'text-rose-800'}>{ok?'✓':'Missing'} {label}</div>}
