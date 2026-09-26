import React, { useMemo, useState } from 'react';
import { DailyExpense, storage } from '../lib/storage';
import { can } from '../lib/permissions';
import { Activity } from '../lib/cpm';
import BsDatePicker from './BsDatePicker';
import { formatBsDate } from '../lib/nepaliDate';
import UploadProgress from './UploadProgress';
import { useSubmissionLock } from '../lib/useSubmissionLock';
import RecordDetailsDialog from './RecordDetailsDialog';

export default function DailyExpenseDashboard({ projectId, userName, userEmail, userRole, activities = [] }: { projectId: string; userName: string; userEmail: string; userRole: string; activities?: Activity[] }) {
  const [expenses, setExpenses] = useState<DailyExpense[]>(() => storage.getDailyExpenses());
  const [employees, setEmployees] = useState(() => storage.getEmployees());
  const [showForm, setShowForm] = useState(false);
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [filter, setFilter] = useState<'all' | DailyExpense['status']>('all');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [slip, setSlip] = useState<File | null>(null);
  const [selectedExpense, setSelectedExpense] = useState<DailyExpense | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<object | null>(null);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const { busy: saving, run: runSubmission } = useSubmissionLock();
  const [form, setForm] = useState(() => ({
    expense_date: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0],
    category: 'material' as DailyExpense['category'], description: '', vendor: '', amount: 0,
    payment_method: 'cash' as DailyExpense['payment_method'], reference: '', wbs_code: '', activity_id: activities[0]?.id || '',
    employee_id: '', employee_name: '',
    status: 'submitted' as DailyExpense['status'], recorded_by: userName, recorded_by_email: userEmail
  }));
  const [employeeForm, setEmployeeForm] = useState<{
    employee_id: string; name: string; email: string; phone: string; role: string; trade: string;
    site_location: string; daily_rate: number; status: 'active' | 'inactive'; assigned_to: string;
  }>({
    employee_id: '', name: '', email: '', phone: '', role: 'Site Worker', trade: '', site_location: '', daily_rate: 0,
    status: 'active' as const, assigned_to: projectId
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

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    await runSubmission(async () => { try {
    const existingExpense = expenses.find(item => item.id === editingExpenseId);
    let payment_slip_path = existingExpense?.payment_slip_path || '';
    let payment_slip_url = existingExpense?.payment_slip_url || '';
    if (slip) {
      const uploaded = await storage.uploadProjectDocument(slip, 'payment_slip', form.reference, userName, `Payment slip for ${form.description}`);
      payment_slip_path = uploaded.storage_path || '';
      payment_slip_url = uploaded.url || '';
    }
    const selectedActivity = activities.find(activity => activity.id === form.activity_id);
    const selectedEmployee = employees.find(employee => employee.employee_id === form.employee_id);
    storage.saveDailyExpense({
      ...form,
      id: editingExpenseId || undefined,
      wbs_code: selectedActivity?.wbs_code || '',
      employee_name: selectedEmployee?.name || form.employee_name,
      payment_slip_path,
      payment_slip_url,
    });
    setExpenses(storage.getDailyExpenses());
    setShowForm(false);
    setEditingExpenseId(null);
    setSlip(null);
    setForm({...form, description:'', vendor:'', amount:0, reference:'', wbs_code:'', employee_id:'', employee_name:'', status:'submitted', recorded_by:userName, recorded_by_email:userEmail});
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not save the expense or payment evidence.');
    } });
  };

  const saveEmployee = (event: React.FormEvent) => {
    event.preventDefault();
    storage.saveEmployee({ ...employeeForm, id: editingEmployeeId || undefined });
    setEmployees(storage.getEmployees());
    setShowEmployeeForm(false);
    setEditingEmployeeId(null);
    setEmployeeForm({ employee_id: '', name: '', email: '', phone: '', role: 'Site Worker', trade: '', site_location: '', daily_rate: 0, status: 'active', assigned_to: projectId });
  };
  const startEditExpense = (item: DailyExpense) => {
    setEditingExpenseId(item.id);
    setForm({ ...form, ...item, status: item.status, recorded_by: item.recorded_by || userName, recorded_by_email: item.recorded_by_email || userEmail });
    setSlip(null); setShowForm(true);
  };
  const startEditEmployee = (employee: any) => {
    setEditingEmployeeId(employee.id);
    setEmployeeForm({ employee_id: employee.employee_id || '', name: employee.name || '', email: employee.email || '', phone: employee.phone || '', role: employee.role || 'Site Worker', trade: employee.trade || '', site_location: employee.site_location || '', daily_rate: Number(employee.daily_rate || 0), status: employee.status || 'active', assigned_to: employee.assigned_to || projectId });
    setShowEmployeeForm(true);
  };

  const updateStatus = (item: DailyExpense, status: DailyExpense['status']) => {
    if (status === 'approved' && !item.payment_slip_path && !item.payment_slip_url) {
      window.alert('Upload the invoice, voucher or payment slip before approving this expense.');
      return;
    }
    storage.saveDailyExpense({...item,status});
    setExpenses(storage.getDailyExpenses());
  };
  const ownRecordsOnly = ['field_employee', 'site_engineer', 'subcontractor'].includes(userRole);
  const visible = expenses
    .filter(item => !ownRecordsOnly || item.recorded_by_email === userEmail || item.recorded_by === userName)
    .filter(item => filter === 'all' || item.status === filter)
    .filter(item => employeeFilter === 'all' || item.employee_id === employeeFilter || item.employee_name === employeeFilter)
    .sort((a,b)=>b.expense_date.localeCompare(a.expense_date));
  const canApprove = can(userRole, 'approve_expenses');
  const accumulatedByDate = useMemo(() => {
    const grouped = new Map<string, number>();
    expenses
      .filter(item => item.status !== 'rejected' && (!fromDate || item.expense_date >= fromDate) && (!toDate || item.expense_date <= toDate))
      .forEach(item => grouped.set(item.expense_date, (grouped.get(item.expense_date) || 0) + item.amount));
    return [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .reduce<Array<{ date: string; amount: number; accumulated: number }>>((rows, [date, amount]) => [
        ...rows,
        { date, amount, accumulated: (rows.at(-1)?.accumulated || 0) + amount },
      ], []);
  }, [expenses, fromDate, toDate]);
  const rangeTotal = accumulatedByDate.at(-1)?.accumulated || 0;
  const maxAccumulated = Math.max(1, rangeTotal);

  return <div className="space-y-5 text-xs" key={projectId}><UploadProgress active={saving} label={slip?'Uploading the payment evidence and saving the expense…':'Saving the expense…'}/>
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
      <div><h2 className="text-base font-semibold text-slate-900">Employee Daily Expense Register</h2><p className="text-slate-600">Record site spending by employee, BOQ work item, vendor, payment slip and approval status.</p></div>
      <div className="flex flex-wrap gap-2">
        {can(userRole,'manage_users') && <button onClick={()=>{setEditingEmployeeId(null);setShowEmployeeForm(value=>!value);}} className="bg-white border border-blue-200 text-blue-700 px-4 py-2 rounded-lg font-semibold">+ Employee ID</button>}
        <button onClick={()=>{setEditingExpenseId(null);setShowForm(value=>!value);}} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-semibold">+ Record Expense</button>
      </div>
    </div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Metric label="Selected Day" value={summary.today}/><Metric label="Current Month" value={summary.month}/><Metric label="Awaiting Approval" value={summary.pending} warning/><Metric label="Project Recorded" value={summary.total}/>
    </div>
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div><h3 className="font-bold text-slate-900">Accumulated finance by date</h3><p className="text-slate-500">Approved and submitted daily costs rolled up across the selected period.</p></div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="From (BS)"><BsDatePicker value={fromDate} onChange={setFromDate}/></Field>
          <Field label="To (BS)"><BsDatePicker value={toDate} onChange={setToDate}/></Field>
        </div>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_220px]">
        <div className="flex h-44 items-end gap-2 overflow-x-auto rounded-lg bg-slate-50 p-3">
          {accumulatedByDate.length===0?<div className="m-auto text-slate-500">No cost records in this date range.</div>:accumulatedByDate.map(row=><div key={row.date} className="flex min-w-20 flex-1 flex-col items-center justify-end gap-1" title={`${formatBsDate(row.date)}: NPR ${row.accumulated.toLocaleString()}`}><span className="text-[10px] font-bold text-slate-600">{(row.accumulated/1_000_000).toFixed(1)}m</span><div className="w-full rounded-t bg-emerald-500" style={{height:`${Math.max(6,(row.accumulated/maxAccumulated)*110)}px`}}/><span className="text-[9px] text-slate-500">{formatBsDate(row.date, { nepaliDigits: false }).replace(' BS','')}</span></div>)}
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4"><div className="text-xs font-bold uppercase text-emerald-700">Accumulated in range</div><div className="mt-2 text-2xl font-extrabold text-emerald-800">NPR {rangeTotal.toLocaleString()}</div><div className="mt-2 text-xs text-emerald-700">{accumulatedByDate.length} posting date(s)</div></div>
      </div>
    </section>
    {showEmployeeForm&&can(userRole,'manage_users')&&<form onSubmit={saveEmployee} className="bg-white border border-blue-100 rounded-xl p-4 shadow-sm space-y-4">
      <h3 className="font-bold text-slate-900">{editingEmployeeId ? 'Edit employee record' : 'Create employee ID'}</h3>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Field label="Employee ID"><input required placeholder="EMP-025" value={employeeForm.employee_id} onChange={e=>setEmployeeForm({...employeeForm,employee_id:e.target.value})}/></Field>
        <Field label="Employee Name"><input required value={employeeForm.name} onChange={e=>setEmployeeForm({...employeeForm,name:e.target.value})}/></Field>
        <Field label="Role / Trade"><input value={employeeForm.role} onChange={e=>setEmployeeForm({...employeeForm,role:e.target.value})}/></Field>
        <Field label="Site / Assigned Place"><input value={employeeForm.site_location} onChange={e=>setEmployeeForm({...employeeForm,site_location:e.target.value})}/></Field>
        <Field label="Email"><input type="email" value={employeeForm.email} onChange={e=>setEmployeeForm({...employeeForm,email:e.target.value})}/></Field>
        <Field label="Phone"><input value={employeeForm.phone} onChange={e=>setEmployeeForm({...employeeForm,phone:e.target.value})}/></Field>
        <Field label="Daily Rate"><input type="number" min="0" value={employeeForm.daily_rate || ''} onChange={e=>setEmployeeForm({...employeeForm,daily_rate:Number(e.target.value)})}/></Field>
        <Field label="Status"><select value={employeeForm.status} onChange={e=>setEmployeeForm({...employeeForm,status:e.target.value as 'active'|'inactive'})}><option value="active">active</option><option value="inactive">inactive</option></select></Field>
      </div>
      <div className="flex gap-2"><button className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-semibold">{editingEmployeeId ? 'Save employee changes' : 'Save Employee'}</button>{editingEmployeeId && <button type="button" onClick={()=>{setEditingEmployeeId(null);setShowEmployeeForm(false);}} className="border border-slate-300 px-4 py-2 rounded-lg font-semibold text-slate-700">Cancel</button>}</div>
    </form>}
    {showForm&&<form onSubmit={save} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Field label="Expense Date (BS)"><BsDatePicker required value={form.expense_date} onChange={expense_date=>setForm({...form,expense_date})}/></Field>
        <Field label="Employee"><select value={form.employee_id} onChange={e=>setForm({...form,employee_id:e.target.value,employee_name:employees.find(emp=>emp.employee_id===e.target.value)?.name||''})}><option value="">Select employee</option>{employees.map(employee=><option key={employee.id} value={employee.employee_id}>{employee.employee_id} — {employee.name}</option>)}</select></Field>
        <Field label="Category"><select value={form.category} onChange={e=>setForm({...form,category:e.target.value as DailyExpense['category']})}>{['labour','material','equipment','fuel','transport','site_overhead','subcontractor','other'].map(value=><option key={value} value={value}>{value.replaceAll('_',' ')}</option>)}</select></Field>
        <Field label="Amount (NPR)"><input required type="number" min="0" step="0.01" value={form.amount || ''} onChange={e=>setForm({...form,amount:Number(e.target.value)})}/></Field>
        <Field label="Payment Method"><select value={form.payment_method} onChange={e=>setForm({...form,payment_method:e.target.value as DailyExpense['payment_method']})}>{['cash','bank','credit','petty_cash'].map(value=><option key={value} value={value}>{value.replaceAll('_',' ')}</option>)}</select></Field>
        <Field label="Description"><input required placeholder="What was purchased or paid?" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></Field>
        <Field label="Vendor / Payee"><input value={form.vendor} onChange={e=>setForm({...form,vendor:e.target.value})}/></Field>
        <Field label="Invoice / Voucher Ref"><input value={form.reference} onChange={e=>setForm({...form,reference:e.target.value})}/></Field>
        <Field label="BOQ item / Work"><select value={form.activity_id} onChange={e=>setForm({...form,activity_id:e.target.value})}>{activities.map(activity=><option key={activity.id} value={activity.id}>{activity.wbs_code} — {activity.name}</option>)}</select></Field>
        <Field label="Invoice / voucher / payment slip"><input type="file" accept="application/pdf,image/*" onChange={e=>setSlip(e.target.files?.[0] || null)}/></Field>
      </div>
      <button disabled={saving} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-semibold disabled:opacity-60">{saving?'Saving…':editingExpenseId?'Save expense changes':'Save Expense Record'}</button>
    </form>}
    <div className="flex flex-wrap items-end gap-2">
      {(['all','draft','submitted','approved','rejected'] as const).map(value=><button key={value} onClick={()=>setFilter(value)} className={`px-3 py-1.5 rounded-full capitalize ${filter===value?'bg-blue-700 text-white':'bg-white border border-slate-300 text-slate-700'}`}>{value}</button>)}
      <Field label="Filter by Employee"><select value={employeeFilter} onChange={e=>setEmployeeFilter(e.target.value)}><option value="all">All employees</option>{employees.map(employee=><option key={employee.id} value={employee.employee_id}>{employee.employee_id} — {employee.name}</option>)}</select></Field>
    </div>
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <table className="w-full min-w-[1050px]"><thead><tr className="border-b border-slate-200 text-slate-600">{['Date (BS)','Employee','Project / BOQ','Category / Description','Vendor','Reference / Slip','Payment','Amount','Status','Action'].map(title=><th key={title} className="text-left py-3">{title}</th>)}</tr></thead>
        <tbody>{visible.map(item=>{const canEdit = ['draft','submitted','rejected'].includes(item.status) && (canApprove || item.recorded_by_email===userEmail || item.recorded_by===userName);return <tr key={item.id} className="border-b border-slate-100"><td className="py-3 font-mono">{formatBsDate(item.expense_date)}</td><td>{item.employee_id||'—'}<div className="text-slate-500">{item.employee_name||item.recorded_by}</div></td><td><b>{storage.getProject().name}</b><div className="font-mono text-slate-500">{item.wbs_code||activities.find(activity=>activity.id===item.activity_id)?.wbs_code||'General'}</div></td><td><b className="capitalize">{item.category.replaceAll('_',' ')}</b><div className="text-slate-500">{item.description}</div></td><td>{item.vendor||'—'}</td><td className="font-mono">{item.reference||'—'}{(item.payment_slip_path||item.payment_slip_url)&&<div className="text-[10px] text-emerald-700">Evidence uploaded</div>}</td><td className="capitalize">{item.payment_method.replaceAll('_',' ')}</td><td className="font-bold">NPR {item.amount.toLocaleString()}</td><td><Status value={item.status}/></td><td><div className="flex gap-2"><button onClick={()=>setSelectedExpense(item)} className="font-semibold text-blue-800">View details</button>{canEdit&&<button onClick={()=>startEditExpense(item)} className="font-semibold text-blue-800">Edit details</button>}{canApprove&&item.status==='submitted'&&<><button onClick={()=>updateStatus(item,'approved')} className="text-emerald-800 font-semibold">Approve</button><button onClick={()=>updateStatus(item,'rejected')} className="text-rose-800 font-semibold">Reject</button></>}</div></td></tr>})}</tbody>
      </table>
    </div>
    {can(userRole,'manage_users') && <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><h3 className="font-bold text-slate-900">Project employee directory</h3><p className="mt-1 text-slate-600">Employee IDs are project-scoped. Inactive records remain available for historical expense references.</p><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[760px]"><thead><tr className="border-b border-slate-200 text-left text-slate-600">{['Employee ID','Name / Role','Location','Daily Rate','Status','Action'].map(title=><th key={title} className="py-2">{title}</th>)}</tr></thead><tbody>{employees.map(employee=><tr key={employee.id} className="border-b border-slate-100"><td className="py-2 font-mono">{employee.employee_id}</td><td><b>{employee.name}</b><div className="text-slate-500">{employee.role}{employee.trade?` · ${employee.trade}`:''}</div></td><td>{employee.site_location||'—'}</td><td>NPR {Number(employee.daily_rate||0).toLocaleString()}</td><td><Status value={employee.status==='inactive'?'rejected':'approved' as DailyExpense['status']}/></td><td><div className="flex gap-2"><button onClick={()=>setSelectedEmployee(employee)} className="font-semibold text-blue-800">View details</button><button onClick={()=>startEditEmployee(employee)} className="font-semibold text-blue-800">Edit details</button></div></td></tr>)}</tbody></table></div></section>}
    <RecordDetailsDialog title="Daily expense" record={selectedExpense} onClose={()=>setSelectedExpense(null)}/>
    <RecordDetailsDialog title="Employee" record={selectedEmployee} onClose={()=>setSelectedEmployee(null)}/>
  </div>;
}
function Metric({label,value,warning=false}:{label:string;value:number;warning?:boolean}){return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{label}</div><div className={`text-xl font-bold mt-1 ${warning&&value>0?'text-amber-700':'text-slate-950'}`}>NPR {value.toLocaleString()}</div></div>}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="text-slate-500 space-y-1"><span className="block font-medium">{label}</span><span className="[&_input]:w-full [&_select]:w-full [&_input]:p-2.5 [&_select]:p-2.5 [&_input]:rounded-lg [&_select]:rounded-lg">{children}</span></label>}
function Status({value}:{value:DailyExpense['status']}){return <span className={`px-2 py-1 rounded-full text-[10px] uppercase font-bold ${value==='approved'?'bg-emerald-500/10 text-emerald-600':value==='rejected'?'bg-rose-500/10 text-rose-600':value==='submitted'?'bg-amber-500/10 text-amber-600':'bg-slate-700 text-slate-600'}`}>{value}</span>}
