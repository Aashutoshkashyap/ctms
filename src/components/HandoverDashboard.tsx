import React, { useState } from 'react';
import { HandoverItem, storage } from '../lib/storage';
import { formatBsDate, todayAdDate } from '../lib/nepaliDate';
import BsDatePicker from './BsDatePicker';
import UploadProgress from './UploadProgress';
import { useSubmissionLock } from '../lib/useSubmissionLock';

interface Props {
  handoverList: HandoverItem[];
  userRole: string;
  userName: string;
  onReload: () => void;
}

const blankItem = () => ({ item_name: '', category: 'as_built', responsible_party: '', due_date: todayAdDate(), remarks: '', completion_remarks: '', evidence_document_path: '', evidence_document_url: '' });

export default function HandoverDashboard({ handoverList, userRole, userName, onReload }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blankItem);
  const [completing, setCompleting] = useState<HandoverItem | null>(null);
  const [completionDate, setCompletionDate] = useState(todayAdDate());
  const [completionRemarks, setCompletionRemarks] = useState('');
  const [evidence, setEvidence] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const { busy: uploading, run: runUpload } = useSubmissionLock();
  const canManage = ['project_director','project_manager','qa_qc_engineer'].includes(userRole);
  const approved = handoverList.filter(item => item.status === 'approved').length;
  const progress = handoverList.length ? Math.round((approved / handoverList.length) * 100) : 0;

  const addItem = (event: React.FormEvent) => {
    event.preventDefault();
    storage.addHandoverItem(form);
    setForm(blankItem()); setShowForm(false); setMessage('Handover deliverable added and assigned.'); onReload();
  };

  const completeItem = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!completing || !evidence || !completionRemarks.trim()) return setMessage('Completion remarks and a handover evidence file are required.');
    await runUpload(async () => { try {
      const uploaded = await storage.uploadProjectDocument(evidence, 'report', completing.id, userName, `Handover: ${completing.item_name}`);
      storage.completeHandoverItem(completing.id, {
        approved_by: userName,
        approved_date: completionDate,
        completion_remarks: completionRemarks,
        evidence_document_path: uploaded.storage_path || '',
        evidence_document_url: uploaded.url || '',
      });
      setCompleting(null); setEvidence(null); setCompletionRemarks(''); setMessage('Handover item completed with private evidence.'); onReload();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save the handover evidence.'); } });
  };

  return <div className="space-y-5"><UploadProgress active={uploading} label="Uploading and securing the handover evidence…"/>
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><h2 className="text-lg font-extrabold text-slate-950">Handover Checklist</h2><p className="mt-1 max-w-3xl text-sm text-slate-600">The Project Director, Project Manager or QA/QC Engineer creates required deliverables, assigns a responsible party and due date, then closes each item only after evidence is uploaded.</p></div>{canManage&&<button type="button" onClick={()=>setShowForm(value=>!value)} className="rounded-lg bg-blue-700 px-4 py-2 font-bold text-white">+ Add handover item</button>}</div><div className="mt-4 flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-700" style={{width:`${progress}%`}}/></div><b className="text-sm text-blue-800">{approved}/{handoverList.length} · {progress}%</b></div></section>
    {message&&<div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-950">{message}</div>}
    {showForm&&canManage&&<form onSubmit={addItem} className="rounded-xl border border-blue-200 bg-white p-5 shadow-sm"><h3 className="font-bold text-slate-950">Add required deliverable</h3><div className="mt-3 grid gap-3 md:grid-cols-3"><Field label="Deliverable"><input required value={form.item_name} onChange={event=>setForm({...form,item_name:event.target.value})} placeholder="As-built drawings for drainage works"/></Field><Field label="Category"><select value={form.category} onChange={event=>setForm({...form,category:event.target.value})}>{['as_built','test_certificate','operation_manual','warranty','training','clearance','taking_over','other'].map(value=><option key={value} value={value}>{value.replaceAll('_',' ')}</option>)}</select></Field><Field label="Responsible Party"><input required value={form.responsible_party} onChange={event=>setForm({...form,responsible_party:event.target.value})} placeholder="QA/QC Team / Subcontractor"/></Field><Field label="Due Date (BS)"><BsDatePicker required value={form.due_date} onChange={due_date=>setForm({...form,due_date})}/></Field><Field label="Requirements / Remarks"><textarea required value={form.remarks} onChange={event=>setForm({...form,remarks:event.target.value})}/></Field></div><button className="mt-4 rounded-lg bg-emerald-700 px-4 py-2.5 font-bold text-white">Save checklist item</button></form>}
    <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><table className="w-full min-w-[1000px] text-sm"><thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-600">{['Deliverable','Category','Responsible','Due (BS)','Requirements','Evidence','Status','Completed (BS)','Action'].map(title=><th key={title} className="p-3">{title}</th>)}</tr></thead><tbody>{handoverList.map(item=><tr key={item.id} className="border-b border-slate-100"><td className="p-3 font-bold text-slate-950">{item.item_name}</td><td className="p-3 capitalize">{item.category.replaceAll('_',' ')}</td><td className="p-3">{item.responsible_party||'Not assigned'}</td><td className={`p-3 ${item.status!=='approved'&&item.due_date&&item.due_date<todayAdDate()?'font-bold text-rose-800':''}`}>{formatBsDate(item.due_date)}</td><td className="p-3 text-slate-600">{item.completion_remarks||item.remarks||'—'}</td><td className={`p-3 font-bold ${item.evidence_document_path||item.evidence_document_url?'text-emerald-800':'text-rose-800'}`}>{item.evidence_document_path||item.evidence_document_url?'Stored':'Missing'}</td><td className="p-3"><Status value={item.status}/></td><td className="p-3">{formatBsDate(item.approved_date)}<div className="text-xs text-slate-500">{item.approved_by||''}</div></td><td className="p-3">{item.status!=='approved'&&canManage?<button onClick={()=>{setCompleting(item);setCompletionDate(todayAdDate());}} className="font-bold text-blue-800">Complete with evidence</button>:'—'}</td></tr>)}</tbody></table>{handoverList.length===0&&<div className="p-8 text-center text-slate-600">No checklist items yet. Add the contract handover deliverables before completion starts.</div>}</section>
    {completing&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4"><form onSubmit={completeItem} className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-2xl"><div><h3 className="font-bold text-slate-950">Complete handover item</h3><p className="text-sm text-slate-600">{completing.item_name}</p></div><Field label="Completion Date (BS)"><BsDatePicker required value={completionDate} onChange={setCompletionDate}/></Field><Field label="Completion Remarks"><textarea required value={completionRemarks} onChange={event=>setCompletionRemarks(event.target.value)}/></Field><Field label="Signed / Approved Evidence"><input required type="file" accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx" onChange={event=>setEvidence(event.target.files?.[0]||null)}/></Field><div className="flex gap-2"><button disabled={uploading} className="flex-1 rounded-lg bg-blue-700 px-4 py-2.5 font-bold text-white">Complete item</button><button type="button" onClick={()=>setCompleting(null)} className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 font-bold text-slate-800">Cancel</button></div></form></div>}
  </div>;
}

function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="text-sm font-semibold text-slate-700">{label}<div className="mt-1 [&_input]:w-full [&_select]:w-full [&_textarea]:w-full [&_input]:rounded-lg [&_select]:rounded-lg [&_textarea]:rounded-lg [&_input]:p-2.5 [&_select]:p-2.5 [&_textarea]:p-2.5">{children}</div></label>}
function Status({value}:{value:string}){return <span className={`rounded-full px-2 py-1 text-xs font-bold capitalize ${value==='approved'?'bg-emerald-50 text-emerald-900':'bg-amber-50 text-amber-900'}`}>{value}</span>}
