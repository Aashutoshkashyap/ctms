import React, { useMemo, useState } from 'react';
import { ContractObligation, storage } from '../lib/storage';

export default function ContractObligationsDashboard({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<ContractObligation[]>(() => storage.getContractObligations());
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    reference: '', title: '', category: 'notice' as ContractObligation['category'], responsible_party: '',
    due_date: '', status: 'open' as ContractObligation['status'], evidence: '', notes: ''
  });
  const today = new Date().toISOString().split('T')[0];
  const summary = useMemo(() => ({
    open: items.filter(item => item.status === 'open').length,
    dueSoon: items.filter(item => item.status === 'due_soon').length,
    overdue: items.filter(item => item.status === 'overdue' || (item.status === 'open' && item.due_date < today)).length,
    complied: items.filter(item => item.status === 'complied').length
  }), [items, today]);

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    storage.saveContractObligation(form);
    setItems(storage.getContractObligations());
    setShowForm(false);
  };
  const markComplied = (item: ContractObligation) => {
    storage.saveContractObligation({...item, status:'complied'});
    setItems(storage.getContractObligations());
  };

  return <div className="space-y-5 text-xs" key={projectId}>
    <div className="flex justify-between items-center"><div><h2 className="text-base font-semibold">Contract Obligations & Deadline Register</h2><p className="text-slate-400">Notices, securities, insurance, approvals, payment and reporting duties.</p></div><button onClick={()=>setShowForm(v=>!v)} className="bg-blue-600 px-3 py-2 rounded-lg font-semibold">+ Add Obligation</button></div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Object.entries(summary).map(([key,value])=><div key={key} className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-4"><div className="uppercase text-[10px] text-slate-500 font-bold">{key.replace(/([A-Z])/g,' $1')}</div><div className={`text-xl font-bold ${key==='overdue'&&value>0?'text-rose-400':'text-slate-100'}`}>{value}</div></div>)}</div>
    {showForm&&<form onSubmit={save} className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-800/60 border border-slate-700 p-4 rounded-xl">
      <Input label="Clause / Reference"><input required value={form.reference} onChange={e=>setForm({...form,reference:e.target.value})}/></Input>
      <Input label="Obligation"><input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></Input>
      <Input label="Responsible Party"><input required value={form.responsible_party} onChange={e=>setForm({...form,responsible_party:e.target.value})}/></Input>
      <Input label="Category"><select value={form.category} onChange={e=>setForm({...form,category:e.target.value as ContractObligation['category']})}>{['notice','security','insurance','approval','payment','reporting','handover'].map(v=><option key={v}>{v}</option>)}</select></Input>
      <Input label="Due Date"><input required type="date" value={form.due_date} onChange={e=>setForm({...form,due_date:e.target.value})}/></Input>
      <Input label="Evidence Required"><input value={form.evidence} onChange={e=>setForm({...form,evidence:e.target.value})}/></Input>
      <Input label="Notes"><input value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></Input>
      <button className="self-end bg-emerald-600 p-2 rounded font-semibold">Save Obligation</button>
    </form>}
    <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-4 overflow-x-auto"><table className="w-full min-w-[900px]"><thead><tr className="text-slate-400 border-b border-slate-700">{['Reference','Obligation','Category','Responsible','Due','Evidence','Status','Action'].map(h=><th key={h} className="text-left py-2">{h}</th>)}</tr></thead><tbody>{items.map(item=>{const overdue=item.status!=='complied'&&item.due_date<today;return <tr key={item.id} className="border-b border-slate-800"><td className="py-3 font-mono">{item.reference}</td><td><b>{item.title}</b><div className="text-slate-500">{item.notes}</div></td><td className="capitalize">{item.category}</td><td>{item.responsible_party}</td><td className={overdue?'text-rose-400':''}>{item.due_date}</td><td>{item.evidence||'—'}</td><td><span className={`px-2 py-1 rounded-full text-[10px] uppercase font-bold ${overdue||item.status==='overdue'?'bg-rose-500/10 text-rose-400':item.status==='complied'?'bg-emerald-500/10 text-emerald-400':'bg-amber-500/10 text-amber-400'}`}>{overdue?'overdue':item.status.replaceAll('_',' ')}</span></td><td>{item.status!=='complied'&&<button onClick={()=>markComplied(item)} className="text-emerald-400 font-semibold">Mark complied</button>}</td></tr>})}</tbody></table></div>
  </div>;
}
function Input({label,children}:{label:string;children:React.ReactNode}){return <label className="text-slate-400 space-y-1"><span className="block">{label}</span><span className="[&_input]:w-full [&_select]:w-full [&_input]:bg-slate-950 [&_select]:bg-slate-950 [&_input]:border [&_select]:border [&_input]:border-slate-700 [&_select]:border-slate-700 [&_input]:p-2 [&_select]:p-2 [&_input]:rounded [&_select]:rounded [&_input]:text-slate-200 [&_select]:text-slate-200">{children}</span></label>}
