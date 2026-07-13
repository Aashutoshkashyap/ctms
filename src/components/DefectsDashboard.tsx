import React, { useState } from 'react';
import { Activity } from '../lib/cpm';
import { DefectEntry, storage } from '../lib/storage';
import { formatBsDate, todayAdDate } from '../lib/nepaliDate';
import BsDatePicker from './BsDatePicker';
import UploadProgress from './UploadProgress';
import { useSubmissionLock } from '../lib/useSubmissionLock';

interface Props {
  defectsList: DefectEntry[];
  activities: Activity[];
  userRole: string;
  userName: string;
  onReload: () => void;
}

export default function DefectsDashboard({ defectsList, activities, userRole, userName, onReload }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [closing, setClosing] = useState<DefectEntry | null>(null);
  const [closureFile, setClosureFile] = useState<File | null>(null);
  const [closureRemarks, setClosureRemarks] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ defect_description:'', reported_date:todayAdDate(), responsible_team:'', rectification_deadline:todayAdDate(), location:'', severity:'medium' as DefectEntry['severity'], activity_id:'', status:'pending' as const });
  const { busy: uploading, run: runUpload } = useSubmissionLock();
  const canReport = ['project_director','project_manager','qa_qc_engineer','site_engineer'].includes(userRole);
  const canVerify = ['project_director','project_manager','qa_qc_engineer'].includes(userRole);

  const reportDefect = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!sourceFile) return setMessage('Upload a photo, inspection note or defect report before registering the defect.');
    await runUpload(async()=>{try{
      const id=`def-${Date.now()}`;
      const uploaded=await storage.uploadProjectDocument(sourceFile,'test_report',id,userName,`Defect: ${form.defect_description}`);
      storage.addDefect({...form,id,reported_document_path:uploaded.storage_path||'',reported_document_url:uploaded.url||''});
      setForm({defect_description:'',reported_date:todayAdDate(),responsible_team:'',rectification_deadline:todayAdDate(),location:'',severity:'medium',activity_id:'',status:'pending'});setSourceFile(null);setShowForm(false);setMessage('Defect assigned with source evidence.');onReload();
    }catch(error){setMessage(error instanceof Error?error.message:'Could not register the defect.');}});
  };

  const closeDefect = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!closing || !closureRemarks.trim()) return setMessage('Closure or verification remarks are required.');
    const nextStatus = closing.status === 'pending' ? 'rectified' : 'verified';
    if (nextStatus === 'rectified' && !closureFile) return setMessage('Upload rectification evidence before marking the defect rectified.');
    await runUpload(async()=>{try{
      let path=closing.closure_document_path||'';let url=closing.closure_document_url||'';
      if(closureFile){const uploaded=await storage.uploadProjectDocument(closureFile,'test_report',closing.id,userName,`Defect ${nextStatus}: ${closing.defect_description}`);path=uploaded.storage_path||'';url=uploaded.url||'';}
      storage.updateDefectStatus(closing.id,nextStatus,{closure_document_path:path,closure_document_url:url,closure_remarks:closureRemarks,...(nextStatus==='verified'?{verified_by:userName,verified_date:todayAdDate()}:{})});
      setClosing(null);setClosureFile(null);setClosureRemarks('');setMessage(nextStatus==='rectified'?'Rectification evidence recorded; awaiting QA/Director verification.':'Defect closure verified.');onReload();
    }catch(error){setMessage(error instanceof Error?error.message:'Could not update the defect.');}});
  };

  return <div className="space-y-5"><UploadProgress active={uploading} label="Uploading and securing defect evidence…"/>
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><h2 className="text-lg font-extrabold text-slate-950">Defects & Rectification</h2><p className="mt-1 max-w-3xl text-sm text-slate-600">Site, QA/QC, Project Manager or Director records the defect and assigns a team. The team submits rectification evidence; QA/QC, Project Manager or Director verifies final closure.</p></div>{canReport&&<button type="button" onClick={()=>setShowForm(value=>!value)} className="rounded-lg bg-blue-700 px-4 py-2 font-bold text-white">+ Report defect</button>}</div></section>
    {message&&<div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-950">{message}</div>}
    {showForm&&canReport&&<form onSubmit={reportDefect} className="rounded-xl border border-blue-200 bg-white p-5 shadow-sm"><h3 className="font-bold text-slate-950">Register and assign defect</h3><div className="mt-3 grid gap-3 md:grid-cols-3"><Field label="Defect Description"><textarea required value={form.defect_description} onChange={event=>setForm({...form,defect_description:event.target.value})}/></Field><Field label="Location"><input required value={form.location} onChange={event=>setForm({...form,location:event.target.value})} placeholder="Block / floor / chainage"/></Field><Field label="BOQ Item"><select value={form.activity_id} onChange={event=>setForm({...form,activity_id:event.target.value})}><option value="">General / no BOQ link</option>{activities.map(item=><option key={item.id} value={item.id}>{item.wbs_code} — {item.name}</option>)}</select></Field><Field label="Responsible Team"><input required value={form.responsible_team} onChange={event=>setForm({...form,responsible_team:event.target.value})}/></Field><Field label="Severity"><select value={form.severity} onChange={event=>setForm({...form,severity:event.target.value as DefectEntry['severity']})}>{['low','medium','high','critical'].map(value=><option key={value}>{value}</option>)}</select></Field><Field label="Reported Date (BS)"><BsDatePicker required value={form.reported_date} onChange={reported_date=>setForm({...form,reported_date})}/></Field><Field label="Rectification Deadline (BS)"><BsDatePicker required value={form.rectification_deadline} onChange={rectification_deadline=>setForm({...form,rectification_deadline})} min={form.reported_date}/></Field><Field label="Photo / Inspection Report"><input required type="file" accept="application/pdf,image/*,.doc,.docx" onChange={event=>setSourceFile(event.target.files?.[0]||null)}/></Field></div><button disabled={uploading} className="mt-4 rounded-lg bg-emerald-700 px-4 py-2.5 font-bold text-white">Register defect</button></form>}
    <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><table className="w-full min-w-[1100px] text-sm"><thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-600">{['Defect','Location / BOQ','Responsible','Reported (BS)','Deadline (BS)','Severity','Evidence','Status','Closure','Action'].map(title=><th key={title} className="p-3">{title}</th>)}</tr></thead><tbody>{defectsList.map(item=><tr key={item.id} className="border-b border-slate-100"><td className="p-3 font-bold text-slate-950">{item.defect_description}</td><td className="p-3">{item.location||'—'}<div className="text-xs text-slate-500">{activities.find(activity=>activity.id===item.activity_id)?.wbs_code||'General'}</div></td><td className="p-3">{item.responsible_team}</td><td className="p-3">{formatBsDate(item.reported_date)}</td><td className={`p-3 ${item.status!=='verified'&&item.rectification_deadline<todayAdDate()?'font-bold text-rose-800':''}`}>{formatBsDate(item.rectification_deadline)}</td><td className="p-3 capitalize"><Severity value={item.severity||'medium'}/></td><td className="p-3"><div className={item.reported_document_path||item.reported_document_url?'font-bold text-emerald-800':'font-bold text-rose-800'}>Source {item.reported_document_path||item.reported_document_url?'stored':'missing'}</div><div className={item.closure_document_path||item.closure_document_url?'font-bold text-emerald-800':'text-slate-500'}>Closure {item.closure_document_path||item.closure_document_url?'stored':'pending'}</div></td><td className="p-3"><Status value={item.status}/></td><td className="p-3 text-slate-600">{item.closure_remarks||'—'}{item.verified_by&&<div className="text-xs">Verified by {item.verified_by} · {formatBsDate(item.verified_date)}</div>}</td><td className="p-3">{item.status==='pending'&&canReport?<button onClick={()=>setClosing(item)} className="font-bold text-blue-800">Record rectification</button>:item.status==='rectified'&&canVerify?<button onClick={()=>setClosing(item)} className="font-bold text-emerald-800">Verify closure</button>:'—'}</td></tr>)}</tbody></table>{defectsList.length===0&&<div className="p-8 text-center text-slate-600">No defects have been reported.</div>}</section>
    {closing&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4"><form onSubmit={closeDefect} className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-2xl"><div><h3 className="font-bold text-slate-950">{closing.status==='pending'?'Record rectification':'Verify defect closure'}</h3><p className="text-sm text-slate-600">{closing.defect_description}</p></div><Field label="Remarks"><textarea required value={closureRemarks} onChange={event=>setClosureRemarks(event.target.value)}/></Field><Field label={closing.status==='pending'?'Rectification Evidence':'Additional Verification Evidence (optional)'}><input required={closing.status==='pending'} type="file" accept="application/pdf,image/*,.doc,.docx" onChange={event=>setClosureFile(event.target.files?.[0]||null)}/></Field><div className="flex gap-2"><button disabled={uploading} className="flex-1 rounded-lg bg-blue-700 px-4 py-2.5 font-bold text-white">{closing.status==='pending'?'Submit rectification':'Verify closure'}</button><button type="button" onClick={()=>setClosing(null)} className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 font-bold text-slate-800">Cancel</button></div></form></div>}
  </div>;
}

function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="text-sm font-semibold text-slate-700">{label}<div className="mt-1 [&_input]:w-full [&_select]:w-full [&_textarea]:w-full [&_input]:rounded-lg [&_select]:rounded-lg [&_textarea]:rounded-lg [&_input]:p-2.5 [&_select]:p-2.5 [&_textarea]:p-2.5">{children}</div></label>}
function Status({value}:{value:string}){const done=value==='verified';const progress=value==='rectified';return <span className={`rounded-full px-2 py-1 text-xs font-bold capitalize ${done?'bg-emerald-50 text-emerald-900':progress?'bg-blue-50 text-blue-900':'bg-amber-50 text-amber-900'}`}>{value}</span>}
function Severity({value}:{value:string}){const style=value==='critical'?'bg-rose-100 text-rose-900':value==='high'?'bg-orange-100 text-orange-900':value==='medium'?'bg-amber-100 text-amber-900':'bg-slate-100 text-slate-700';return <span className={`rounded-full px-2 py-1 text-xs font-bold ${style}`}>{value}</span>}
