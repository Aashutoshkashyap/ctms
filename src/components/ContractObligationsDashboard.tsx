import React, { useMemo, useState } from 'react';
import { ContractObligation, storage } from '../lib/storage';
import BsDatePicker from './BsDatePicker';
import { formatBsDate, todayAdDate } from '../lib/nepaliDate';
import UploadProgress from './UploadProgress';
import { useSubmissionLock } from '../lib/useSubmissionLock';

export default function ContractObligationsDashboard({ projectId, userName }: { projectId: string; userName: string }) {
  const [items, setItems] = useState<ContractObligation[]>(() => storage.getContractObligations());
  const [showForm, setShowForm] = useState(false);
  const [completing, setCompleting] = useState<ContractObligation | null>(null);
  const [complianceFile, setComplianceFile] = useState<File | null>(null);
  const [complianceRemarks, setComplianceRemarks] = useState('');
  const [compliedDate, setCompliedDate] = useState(todayAdDate());
  const [message, setMessage] = useState('');
  const { busy: saving, run: runUpload } = useSubmissionLock();
  const parties = ['Contractor', 'Employer', 'Engineer', 'Subcontractor', 'Supplier', 'JV Partner'];
  const [form, setForm] = useState({ reference: '', title: '', category: 'notice' as ContractObligation['category'], responsible_party: '', due_date: '', status: 'open' as ContractObligation['status'], evidence: '', notes: '' });
  const today = todayAdDate();
  const summary = useMemo(() => ({
    open: items.filter(item => item.status === 'open').length,
    dueSoon: items.filter(item => item.status === 'due_soon').length,
    overdue: items.filter(item => item.status === 'overdue' || (item.status === 'open' && item.due_date < today)).length,
    complied: items.filter(item => item.status === 'complied').length,
  }), [items, today]);

  const save = (event: React.FormEvent) => {
    event.preventDefault(); storage.saveContractObligation(form); setItems(storage.getContractObligations()); setShowForm(false);
  };
  const markComplied = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!completing || !complianceFile || !complianceRemarks.trim()) return setMessage('Compliance date, remarks and an evidence file are required.');
    await runUpload(async () => { try {
      const uploaded = await storage.uploadProjectDocument(complianceFile, 'compliance_report', completing.id, userName, complianceRemarks);
      storage.saveContractObligation({ ...completing, status: 'complied', complied_date: compliedDate, compliance_remarks: complianceRemarks, evidence: complianceRemarks, evidence_document_path: uploaded.storage_path || '', evidence_document_url: uploaded.url || '' });
      setItems(storage.getContractObligations()); setCompleting(null); setComplianceFile(null); setComplianceRemarks(''); setMessage('Obligation marked complied with private evidence.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save compliance evidence.'); } });
  };

  return <div className="space-y-5 text-xs" key={projectId}><UploadProgress active={saving} label="Uploading and securing the compliance evidence…"/>
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="text-base font-bold text-slate-950">Contract Obligations & Deadline Register</h2><p className="text-slate-600">Notices, securities, insurance, approvals, payment and reporting duties with mandatory closure evidence.</p></div><button onClick={()=>setShowForm(value=>!value)} className="rounded-lg bg-blue-700 px-3 py-2 font-bold text-white">+ Add Obligation</button></div>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Object.entries(summary).map(([key,value])=><div key={key} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-[10px] font-bold uppercase text-slate-600">{key.replace(/([A-Z])/g,' $1')}</div><div className={`text-xl font-bold ${key==='overdue'&&value>0?'text-rose-800':'text-slate-950'}`}>{value}</div></div>)}</div>
    {message&&<div className="rounded-xl border border-blue-200 bg-blue-50 p-3 font-semibold text-blue-950">{message}</div>}
    {showForm&&<form onSubmit={save} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3"><Input label="Clause / Reference"><input required value={form.reference} onChange={event=>setForm({...form,reference:event.target.value})}/></Input><Input label="Obligation to Issue"><input required value={form.title} onChange={event=>setForm({...form,title:event.target.value})}/></Input><Input label="Responsible Party"><select required value={form.responsible_party} onChange={event=>setForm({...form,responsible_party:event.target.value})}><option value="">Choose party</option>{parties.map(party=><option key={party}>{party}</option>)}</select></Input><Input label="Category"><select value={form.category} onChange={event=>setForm({...form,category:event.target.value as ContractObligation['category']})}>{['notice','security','insurance','approval','payment','reporting','handover'].map(value=><option key={value}>{value}</option>)}</select></Input><Input label="Due Date (BS)"><BsDatePicker required value={form.due_date} onChange={due_date=>setForm({...form,due_date})}/></Input><Input label="Remarks"><input value={form.notes} onChange={event=>setForm({...form,notes:event.target.value,evidence:event.target.value})}/></Input><button className="self-end rounded-lg bg-emerald-700 p-2 font-bold text-white">Save Obligation</button></form>}
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><table className="w-full min-w-[1000px]"><thead><tr className="border-b border-slate-200 text-left text-slate-600">{['Reference','Obligation to Issue','Category','Responsible','Due (BS)','Remarks','Closure evidence','Status','Action'].map(title=><th key={title} className="py-2">{title}</th>)}</tr></thead><tbody>{items.map(item=>{const overdue=item.status!=='complied'&&item.due_date<today;return <tr key={item.id} className="border-b border-slate-100"><td className="py-3 font-mono">{item.reference}</td><td><b>{item.title}</b></td><td className="capitalize">{item.category}</td><td>{item.responsible_party}</td><td className={overdue?'font-bold text-rose-800':''}>{formatBsDate(item.due_date)}</td><td>{item.compliance_remarks||item.notes||item.evidence||'—'}</td><td>{item.evidence_document_path?<span className="font-bold text-emerald-800">Stored</span>:<span className="font-bold text-rose-800">Missing</span>}</td><td><Status value={overdue?'overdue':item.status}/></td><td>{item.status!=='complied'&&<button onClick={()=>{setCompleting(item);setCompliedDate(today);}} className="font-bold text-emerald-800">Close with evidence</button>}</td></tr>})}</tbody></table></div>
    {completing&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"><form onSubmit={markComplied} className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-2xl"><div><h3 className="text-lg font-bold text-slate-950">Close obligation with evidence</h3><p className="text-sm text-slate-600">{completing.reference} · {completing.title}</p></div><Input label="Complied date (BS)"><BsDatePicker required value={compliedDate} onChange={setCompliedDate}/></Input><Input label="Compliance remarks"><textarea required value={complianceRemarks} onChange={event=>setComplianceRemarks(event.target.value)}/></Input><Input label="Evidence / compliance report"><input required type="file" accept="application/pdf,image/*,.doc,.docx" onChange={event=>setComplianceFile(event.target.files?.[0]||null)}/></Input><div className="flex gap-2"><button disabled={saving} className="flex-1 rounded-lg bg-emerald-700 px-4 py-2.5 font-bold text-white">{saving?'Uploading…':'Mark complied'}</button><button type="button" onClick={()=>setCompleting(null)} className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 font-bold text-slate-800">Cancel</button></div></form></div>}
  </div>;
}
function Input({label,children}:{label:string;children:React.ReactNode}){return <label className="space-y-1 font-semibold text-slate-700"><span className="block">{label}</span><span className="block [&_input]:w-full [&_select]:w-full [&_textarea]:w-full [&_input]:rounded-lg [&_select]:rounded-lg [&_textarea]:rounded-lg [&_input]:p-2 [&_select]:p-2 [&_textarea]:p-2">{children}</span></label>}
function Status({value}:{value:string}){const bad=value==='overdue';const good=value==='complied';return <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${bad?'bg-rose-50 text-rose-800':good?'bg-emerald-50 text-emerald-800':'bg-amber-50 text-amber-800'}`}>{value.replaceAll('_',' ')}</span>}
