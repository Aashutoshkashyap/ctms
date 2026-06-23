import React, { useMemo, useState } from 'react';
import { DailyExpense, storage } from '../lib/storage';
import { can } from '../lib/permissions';

export default function DailyExpenseDashboard({ projectId, userName, userRole }: { projectId: string; userName: string; userRole: string }) {
  const [expenses, setExpenses] = useState<DailyExpense[]>(() => storage.getDailyExpenses());
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<'all' | DailyExpense['status']>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [form, setForm] = useState({
    expense_date: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0],
    category: 'material' as DailyExpense['category'], description: '', vendor: '', amount: 0,
    payment_method: 'cash' as DailyExpense['payment_method'], reference: '', wbs_code: '',
    status: 'submitted' as DailyExpense['status'], recorded_by: userName
  });

  const summary = useMemo(() => {
    const today = form.expense_date;
    return {
      today: expenses.filter(item => item.expense_date === today && item.status !== 'rejected').reduce((sum,item)=>sum+item.amount,0),
      month: expenses.filter(item => item.expense_date.slice(0,7) === today.slice(0,7) && item.status !== 'rejected').reduce((sum,item)=>sum+item.amount,0),
      pending: expenses.filter(item => item.status === 'submitted').reduce((sum,item)=>sum+item.amount,0),
      total: expenses.filter(item => item.status !== 'rejected').reduce((sum,item)=>sum+item.amount,0)
    };
  }, [expenses, form.expense_date]);

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    storage.saveDailyExpense(form);
    setExpenses(storage.getDailyExpenses());
    setShowForm(false);
    setForm({...form, description:'', vendor:'', amount:0, reference:'', wbs_code:'', status:'submitted', recorded_by:userName});
  };

  const updateStatus = (item: DailyExpense, status: DailyExpense['status']) => {
    storage.saveDailyExpense({...item,status});
    setExpenses(storage.getDailyExpenses());
  };
  const visible = expenses.filter(item => filter === 'all' || item.status === filter).sort((a,b)=>b.expense_date.localeCompare(a.expense_date));
  const canApprove = can(userRole, 'approve_expenses');
  const accumulatedByDate = useMemo(() => {
    let running = 0;
    const grouped = new Map<string, number>();
    expenses
      .filter(item => item.status !== 'rejected' && (!fromDate || item.expense_date >= fromDate) && (!toDate || item.expense_date <= toDate))
      .forEach(item => grouped.set(item.expense_date, (grouped.get(item.expense_date) || 0) + item.amount));
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, amount]) => {
      running += amount;
      return { date, amount, accumulated: running };
    });
  }, [expenses, fromDate, toDate]);
  const rangeTotal = accumulatedByDate.at(-1)?.accumulated || 0;
  const maxAccumulated = Math.max(1, rangeTotal);

  return <div className="space-y-5 text-xs" key={projectId}>
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
      <div><h2 className="text-base font-semibold text-slate-100">Daily Expense Register</h2><p className="text-slate-400">Record site spending by date, WBS, vendor, payment method and approval status.</p></div>
      <button onClick={()=>setShowForm(value=>!value)} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-semibold">+ Record Expense</button>
    </div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Metric label="Selected Day" value={summary.today}/><Metric label="Current Month" value={summary.month}/><Metric label="Awaiting Approval" value={summary.pending} warning/><Metric label="Project Recorded" value={summary.total}/>
    </div>
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div><h3 className="font-bold text-slate-900">Accumulated finance by date</h3><p className="text-slate-500">Approved and submitted daily costs rolled up across the selected period.</p></div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="From"><input type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)}/></Field>
          <Field label="To"><input type="date" value={toDate} onChange={e=>setToDate(e.target.value)}/></Field>
        </div>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_220px]">
        <div className="flex h-44 items-end gap-2 overflow-x-auto rounded-lg bg-slate-50 p-3">
          {accumulatedByDate.length===0?<div className="m-auto text-slate-500">No cost records in this date range.</div>:accumulatedByDate.map(row=><div key={row.date} className="flex min-w-14 flex-1 flex-col items-center justify-end gap-1" title={`${row.date}: NPR ${row.accumulated.toLocaleString()}`}><span className="text-[10px] font-bold text-slate-600">{(row.accumulated/1_000_000).toFixed(1)}m</span><div className="w-full rounded-t bg-emerald-500" style={{height:`${Math.max(6,(row.accumulated/maxAccumulated)*110)}px`}}/><span className="text-[9px] text-slate-500">{row.date.slice(5)}</span></div>)}
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4"><div className="text-xs font-bold uppercase text-emerald-700">Accumulated in range</div><div className="mt-2 text-2xl font-extrabold text-emerald-800">NPR {rangeTotal.toLocaleString()}</div><div className="mt-2 text-xs text-emerald-700">{accumulatedByDate.length} posting date(s)</div></div>
      </div>
    </section>
    {showForm&&<form onSubmit={save} className="bg-white border border-slate-700 rounded-xl p-4 shadow-lg space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Field label="Expense Date"><input required type="date" value={form.expense_date} onChange={e=>setForm({...form,expense_date:e.target.value})}/></Field>
        <Field label="Category"><select value={form.category} onChange={e=>setForm({...form,category:e.target.value as DailyExpense['category']})}>{['labour','material','equipment','fuel','transport','site_overhead','subcontractor','other'].map(value=><option key={value} value={value}>{value.replaceAll('_',' ')}</option>)}</select></Field>
        <Field label="Amount (NPR)"><input required type="number" min="0" step="0.01" value={form.amount} onChange={e=>setForm({...form,amount:Number(e.target.value)})}/></Field>
        <Field label="Payment Method"><select value={form.payment_method} onChange={e=>setForm({...form,payment_method:e.target.value as DailyExpense['payment_method']})}>{['cash','bank','credit','petty_cash'].map(value=><option key={value} value={value}>{value.replaceAll('_',' ')}</option>)}</select></Field>
        <Field label="Description"><input required placeholder="What was purchased or paid?" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></Field>
        <Field label="Vendor / Payee"><input value={form.vendor} onChange={e=>setForm({...form,vendor:e.target.value})}/></Field>
        <Field label="Invoice / Voucher Ref"><input value={form.reference} onChange={e=>setForm({...form,reference:e.target.value})}/></Field>
        <Field label="WBS Code"><input placeholder="e.g. 03.02" value={form.wbs_code} onChange={e=>setForm({...form,wbs_code:e.target.value})}/></Field>
      </div>
      <button className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-semibold">Save Expense Record</button>
    </form>}
    <div className="flex flex-wrap gap-2">{(['all','draft','submitted','approved','rejected'] as const).map(value=><button key={value} onClick={()=>setFilter(value)} className={`px-3 py-1.5 rounded-full capitalize ${filter===value?'bg-blue-600 text-white':'bg-white border border-slate-700 text-slate-600'}`}>{value}</button>)}</div>
    <div className="bg-white border border-slate-700 rounded-xl p-4 shadow-lg overflow-x-auto">
      <table className="w-full min-w-[980px]"><thead><tr className="text-slate-400 border-b border-slate-700">{['Date','WBS','Category / Description','Vendor','Reference','Payment','Amount','Status','Action'].map(title=><th key={title} className="text-left py-3">{title}</th>)}</tr></thead>
        <tbody>{visible.map(item=><tr key={item.id} className="border-b border-slate-800"><td className="py-3 font-mono">{item.expense_date}</td><td className="font-mono">{item.wbs_code||'—'}</td><td><b className="capitalize">{item.category.replaceAll('_',' ')}</b><div className="text-slate-500">{item.description}</div></td><td>{item.vendor||'—'}</td><td className="font-mono">{item.reference||'—'}</td><td className="capitalize">{item.payment_method.replaceAll('_',' ')}</td><td className="font-bold">NPR {item.amount.toLocaleString()}</td><td><Status value={item.status}/></td><td>{canApprove&&item.status==='submitted'&&<div className="flex gap-2"><button onClick={()=>updateStatus(item,'approved')} className="text-emerald-600 font-semibold">Approve</button><button onClick={()=>updateStatus(item,'rejected')} className="text-rose-600 font-semibold">Reject</button></div>}</td></tr>)}</tbody>
      </table>
    </div>
  </div>;
}
function Metric({label,value,warning=false}:{label:string;value:number;warning?:boolean}){return <div className="bg-white border border-slate-700 rounded-xl p-4 shadow"><div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{label}</div><div className={`text-xl font-bold mt-1 ${warning&&value>0?'text-amber-600':'text-slate-100'}`}>NPR {value.toLocaleString()}</div></div>}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="text-slate-500 space-y-1"><span className="block font-medium">{label}</span><span className="[&_input]:w-full [&_select]:w-full [&_input]:p-2.5 [&_select]:p-2.5 [&_input]:rounded-lg [&_select]:rounded-lg">{children}</span></label>}
function Status({value}:{value:DailyExpense['status']}){return <span className={`px-2 py-1 rounded-full text-[10px] uppercase font-bold ${value==='approved'?'bg-emerald-500/10 text-emerald-600':value==='rejected'?'bg-rose-500/10 text-rose-600':value==='submitted'?'bg-amber-500/10 text-amber-600':'bg-slate-700 text-slate-600'}`}>{value}</span>}
