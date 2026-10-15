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
    let payment_slip_path = '';
    let payment_slip_url = '';
    if (slip) {
      const uploaded = await storage.uploadProjectDocument(slip, 'payment_slip', form.reference, userName, `Payment slip for ${form.description}`);
      payment_slip_path = uploaded.storage_path || '';
      payment_slip_url = uploaded.url || '';
    }
    const selectedActivity = activities.find(activity => activity.id === form.activity_id);
    const selectedEmployee = employees.find(employee => employee.employee_id === form.employee_id);
    storage.saveDailyExpense({
      ...form,
      wbs_code: selectedActivity?.wbs_code || '',
      employee_name: selectedEmployee?.name || form.employee_name,
      payment_slip_path,
      payment_slip_url,
    });
    setExpenses(storage.getDailyExpenses());
    setShowForm(false);
    setSlip(null);
    setForm({...form, description:'', vendor:'', amount:0, reference:'', wbs_code:'', employee_id:'', employee_name:'', status:'submitted', recorded_by:userName, recorded_by_email:userEmail});
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not save the expense or payment evidence.');
    } });
  };

  const saveEmployee = (event: React.FormEvent) => {
    event.preventDefault();
    storage.saveEmployee(employeeForm);
    setEmployees(storage.getEmployees());
    setShowEmployeeForm(false);
    setEmployeeForm({ employee_id: '', name: '', email: '', phone: '', role: 'Site Worker', trade: '', site_location: '', daily_rate: 0, status: 'active', assigned_to: projectId });
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

  return (
    <div className="space-y-6 text-xs" key={projectId}>
      <UploadProgress active={saving} label={slip ? 'Uploading the payment evidence and saving the expense…' : 'Saving the expense…'} />
      
      {/* Header bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 border border-slate-200/90 rounded-2xl shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 text-sm">💰</span>
            <h2 className="text-base font-bold text-slate-900">Employee Daily Expense Register</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Track site expenditures by employee, BOQ work item, vendor, payment slips and approval status.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can(userRole, 'manage_users') && (
            <button 
              onClick={() => setShowEmployeeForm(value => !value)} 
              className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-xl font-semibold text-xs shadow-xs transition"
            >
              {showEmployeeForm ? '✕ Cancel' : '+ Employee ID'}
            </button>
          )}
          <button 
            onClick={() => setShowForm(value => !value)} 
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-semibold text-xs shadow-xs transition"
          >
            {showForm ? '✕ Cancel' : '+ Record Expense'}
          </button>
        </div>
      </div>

      {/* 4 Stat Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Selected Day</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 text-xs">📅</span>
          </div>
          <div className="mt-2 text-lg font-extrabold text-slate-900">NPR {summary.today.toLocaleString()}</div>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Current Month</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-50 text-purple-600 text-xs">🗓️</span>
          </div>
          <div className="mt-2 text-lg font-extrabold text-slate-900">NPR {summary.month.toLocaleString()}</div>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Awaiting Approval</span>
            <span className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs ${summary.pending > 0 ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-600'}`}>
              ⏳
            </span>
          </div>
          <div className={`mt-2 text-lg font-extrabold ${summary.pending > 0 ? 'text-amber-800' : 'text-slate-900'}`}>
            NPR {summary.pending.toLocaleString()}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Project Recorded</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 text-xs">📈</span>
          </div>
          <div className="mt-2 text-lg font-extrabold text-emerald-700">NPR {summary.total.toLocaleString()}</div>
        </div>
      </div>

      {/* Accumulated finance chart section */}
      <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Accumulated Finance by Date</h3>
            <p className="text-xs text-slate-500">Approved and submitted daily costs rolled up across the selected period.</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="From (BS)"><BsDatePicker value={fromDate} onChange={setFromDate} /></Field>
            <Field label="To (BS)"><BsDatePicker value={toDate} onChange={setToDate} /></Field>
          </div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_220px]">
          <div className="flex h-44 items-end gap-2 overflow-x-auto rounded-xl bg-slate-50/80 p-3 border border-slate-100">
            {accumulatedByDate.length === 0 ? (
              <div className="m-auto text-slate-400 text-xs">No cost records in this date range.</div>
            ) : (
              accumulatedByDate.map(row => (
                <div key={row.date} className="flex min-w-20 flex-1 flex-col items-center justify-end gap-1" title={`${formatBsDate(row.date)}: NPR ${row.accumulated.toLocaleString()}`}>
                  <span className="text-[10px] font-bold text-slate-600">{(row.accumulated / 1_000_000).toFixed(1)}m</span>
                  <div className="w-full rounded-t-lg bg-emerald-500 shadow-xs" style={{ height: `${Math.max(6, (row.accumulated / maxAccumulated) * 110)}px` }} />
                  <span className="text-[9px] text-slate-500">{formatBsDate(row.date, { nepaliDigits: false }).replace(' BS', '')}</span>
                </div>
              ))
            )}
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 flex flex-col justify-center">
            <div className="text-[11px] font-bold uppercase text-emerald-800">Accumulated in Range</div>
            <div className="mt-2 text-xl font-extrabold text-emerald-900">NPR {rangeTotal.toLocaleString()}</div>
            <div className="mt-2 text-xs text-emerald-700 font-medium">{accumulatedByDate.length} posting date(s)</div>
          </div>
        </div>
      </section>

      {/* Employee ID Form */}
      {showEmployeeForm && can(userRole, 'manage_users') && (
        <form onSubmit={saveEmployee} className="bg-white border border-blue-200 rounded-2xl p-5 shadow-xs space-y-4">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Create Employee ID</h3>
            <p className="text-xs text-slate-500">Provision unique site employee identifier for attendance, daily reporting and expense logging.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Field label="Employee ID"><input required placeholder="e.g. EMP-025" value={employeeForm.employee_id} onChange={e => setEmployeeForm({...employeeForm, employee_id: e.target.value})} /></Field>
            <Field label="Employee Name"><input required value={employeeForm.name} onChange={e => setEmployeeForm({...employeeForm, name: e.target.value})} placeholder="Full name" /></Field>
            <Field label="Role / Trade"><input value={employeeForm.role} onChange={e => setEmployeeForm({...employeeForm, role: e.target.value})} placeholder="Mason, Surveyor, etc." /></Field>
            <Field label="Site / Assigned Place"><input value={employeeForm.site_location} onChange={e => setEmployeeForm({...employeeForm, site_location: e.target.value})} placeholder="Bridge Pier 2" /></Field>
            <Field label="Email"><input type="email" value={employeeForm.email} onChange={e => setEmployeeForm({...employeeForm, email: e.target.value})} placeholder="Optional email" /></Field>
            <Field label="Phone"><input value={employeeForm.phone} onChange={e => setEmployeeForm({...employeeForm, phone: e.target.value})} placeholder="Mobile number" /></Field>
            <Field label="Daily Rate (NPR)"><input type="number" min="0" value={employeeForm.daily_rate || ''} onChange={e => setEmployeeForm({...employeeForm, daily_rate: Number(e.target.value)})} /></Field>
            <Field label="Status">
              <select value={employeeForm.status} onChange={e => setEmployeeForm({...employeeForm, status: e.target.value as 'active' | 'inactive'})}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowEmployeeForm(false)} className="rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50 transition">
              Cancel
            </button>
            <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-bold shadow-xs transition">
              Save Employee
            </button>
          </div>
        </form>
      )}

      {/* Record Expense Form */}
      {showForm && (
        <form onSubmit={save} className="space-y-4 rounded-2xl border border-blue-200 bg-white p-5 shadow-xs">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Record Daily Site Expense</h3>
            <p className="text-xs text-slate-500">Record cash, fuel, petty expenses or purchases with attached receipt proof.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Field label="Expense Date (BS)"><BsDatePicker required value={form.expense_date} onChange={expense_date => setForm({...form, expense_date})} /></Field>
            <Field label="Employee">
              <select value={form.employee_id} onChange={e => setForm({...form, employee_id: e.target.value, employee_name: employees.find(emp => emp.employee_id === e.target.value)?.name || ''})}>
                <option value="">Select employee...</option>
                {employees.map(employee => (
                  <option key={employee.id} value={employee.employee_id}>
                    {employee.employee_id} — {employee.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Category">
              <select value={form.category} onChange={e => setForm({...form, category: e.target.value as DailyExpense['category']})}>
                {['labour', 'material', 'equipment', 'fuel', 'transport', 'site_overhead', 'subcontractor', 'other'].map(value => (
                  <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>
                ))}
              </select>
            </Field>
            <Field label="Amount (NPR)"><input required type="number" min="0" step="0.01" value={form.amount || ''} onChange={e => setForm({...form, amount: Number(e.target.value)})} /></Field>
            <Field label="Payment Method">
              <select value={form.payment_method} onChange={e => setForm({...form, payment_method: e.target.value as DailyExpense['payment_method']})}>
                {['cash', 'bank', 'credit', 'petty_cash'].map(value => (
                  <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>
                ))}
              </select>
            </Field>
            <Field label="Description"><input required placeholder="What was purchased or paid?" value={form.description} onChange={e => setForm({...form, description: e.target.value})} /></Field>
            <Field label="Vendor / Payee"><input value={form.vendor} onChange={e => setForm({...form, vendor: e.target.value})} placeholder="Store or supplier name" /></Field>
            <Field label="Invoice / Voucher Ref"><input value={form.reference} onChange={e => setForm({...form, reference: e.target.value})} placeholder="Bill number" /></Field>
            <Field label="BOQ Item / Work Node">
              <select value={form.activity_id} onChange={e => setForm({...form, activity_id: e.target.value})}>
                {activities.map(activity => (
                  <option key={activity.id} value={activity.id}>
                    {activity.wbs_code} — {activity.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Invoice / Voucher / Slip File">
              <input type="file" accept="application/pdf,image/*" onChange={e => setSlip(e.target.files?.[0] || null)} />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50 transition">
              Cancel
            </button>
            <button disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-bold shadow-xs transition disabled:opacity-60">
              {saving ? 'Saving…' : 'Save Expense Record'}
            </button>
          </div>
        </form>
      )}

      {/* Filter Tabs & Selectors */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap bg-slate-100 p-1 rounded-xl border border-slate-200/80 w-fit text-xs gap-1">
          {(['all', 'draft', 'submitted', 'approved', 'rejected'] as const).map(value => (
            <button 
              key={value} 
              onClick={() => setFilter(value)} 
              className={`px-3 py-1.5 rounded-lg capitalize font-semibold transition ${
                filter === value ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              {value}
            </button>
          ))}
        </div>
        <div className="w-56">
          <select 
            value={employeeFilter} 
            onChange={e => setEmployeeFilter(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white p-2 text-xs text-slate-900 outline-none"
          >
            <option value="all">All employees</option>
            {employees.map(employee => (
              <option key={employee.id} value={employee.employee_id}>
                {employee.employee_id} — {employee.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Expense History Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">Expense Postings</h3>
            <p className="text-xs text-slate-500">Site financial ledger with payment voucher proofs and sign-off status.</p>
          </div>
          <span className="text-xs font-semibold text-slate-500">
            {visible.length} records
          </span>
        </div>
        <table className="w-full min-w-[1050px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-slate-600 font-semibold">
              {['Date (BS)', 'Employee', 'Project / BOQ', 'Category / Description', 'Vendor', 'Reference / Slip', 'Payment', 'Amount', 'Status', 'Action'].map(title => (
                <th key={title} className="py-2.5 px-3">{title}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {visible.map(item => (
              <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                <td className="py-2.5 px-3 font-mono text-slate-600">{formatBsDate(item.expense_date)}</td>
                <td className="py-2.5 px-3">
                  <span className="font-mono text-xs font-medium text-slate-700">{item.employee_id || '—'}</span>
                  <div className="text-[11px] text-slate-500">{item.employee_name || item.recorded_by}</div>
                </td>
                <td className="py-2.5 px-3">
                  <span className="font-semibold text-slate-900">{storage.getProject().name}</span>
                  <div className="font-mono text-[11px] text-slate-500">{item.wbs_code || activities.find(activity => activity.id === item.activity_id)?.wbs_code || 'General'}</div>
                </td>
                <td className="py-2.5 px-3">
                  <span className="font-semibold capitalize text-slate-800">{item.category.replaceAll('_', ' ')}</span>
                  <div className="text-[11px] text-slate-500 max-w-[180px] truncate">{item.description}</div>
                </td>
                <td className="py-2.5 px-3 text-slate-600">{item.vendor || '—'}</td>
                <td className="py-2.5 px-3">
                  <span className="font-mono text-slate-600">{item.reference || '—'}</span>
                  {(item.payment_slip_path || item.payment_slip_url) && (
                    <div className="text-[10px] text-emerald-700 font-medium">✓ Proof attached</div>
                  )}
                </td>
                <td className="py-2.5 px-3 capitalize text-slate-600">{item.payment_method.replaceAll('_', ' ')}</td>
                <td className="py-2.5 px-3 font-bold font-mono text-slate-900">NPR {item.amount.toLocaleString()}</td>
                <td className="py-2.5 px-3"><Status value={item.status} /></td>
                <td className="py-2.5 px-3">
                  <div className="flex gap-2">
                    <button onClick={() => setSelectedExpense(item)} className="font-semibold text-slate-700 hover:text-slate-900">
                      View
                    </button>
                    {canApprove && item.status === 'submitted' && (
                      <>
                        <button onClick={() => updateStatus(item, 'approved')} className="font-semibold text-emerald-700 hover:text-emerald-800">
                          Approve
                        </button>
                        <button onClick={() => updateStatus(item, 'rejected')} className="font-semibold text-rose-700 hover:text-rose-800">
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={10} className="p-8 text-center text-slate-500">
                  No expense records matching the selected criteria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <RecordDetailsDialog title="Daily Expense Record" record={selectedExpense} onClose={() => setSelectedExpense(null)} />
    </div>
  );
}

function Field({label, children}: {label: string; children: React.ReactNode}) {
  return (
    <label className="text-slate-700 space-y-1 block text-xs font-semibold">
      <span>{label}</span>
      <div className="[&_input]:w-full [&_select]:w-full [&_input]:p-2 [&_select]:p-2 [&_input]:rounded-xl [&_select]:rounded-xl [&_input]:border [&_select]:border [&_input]:border-slate-300 [&_select]:border-slate-300 [&_input]:bg-white [&_select]:bg-white [&_input]:text-slate-900 [&_select]:text-slate-900 [&_input]:text-xs [&_select]:text-xs outline-none">
        {children}
      </div>
    </label>
  );
}

function Status({value}: {value: DailyExpense['status']}) {
  let pillClass = 'status-pill-neutral';
  const label = value.toUpperCase();

  if (value === 'approved') {
    pillClass = 'status-pill-completed';
  } else if (value === 'submitted') {
    pillClass = 'status-pill-pending';
  } else if (value === 'rejected') {
    pillClass = 'status-pill-delayed';
  }

  return (
    <span className={`status-pill ${pillClass}`}>
      <span className="status-pill-dot" />
      {label}
    </span>
  );
}
