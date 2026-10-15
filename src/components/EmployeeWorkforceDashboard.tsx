'use client';

import { useEffect, useMemo, useState } from 'react';
import { storage } from '../lib/storage';
import BsDatePicker from './BsDatePicker';
import LeaveWorkforcePanel from './LeaveWorkforcePanel';
import PayrollPanel from './PayrollPanel';

type Employee = { id: string; employee_code: string; full_name: string; designation?: string; department?: string; phone?: string; employment_status: string; employment_type?: string; joining_date?: string; location?: string; trade_skill?: string; active: boolean };
type Assignment = { id: string; employee_id: string; project_id: string; project_role?: string; status: string; start_date?: string; end_date?: string };

export default function EmployeeWorkforceDashboard({ organizationId, projectId, canManage }: { organizationId?: string; projectId: string; canManage: boolean }) {
  const [employees, setEmployees] = useState<Employee[]>([]); const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [query, setQuery] = useState(''); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ employeeCode: '', fullName: '', designation: '', department: '', phone: '', employmentStatus: 'active', employmentType: 'full_time', joiningDate: '', location: '', tradeSkill: '' });
  const authorization = async () => ({ Authorization: `Bearer ${(await storage.getAuthSession())?.access_token || ''}`, 'Content-Type': 'application/json' });
  const load = async () => {
    setError(''); const headers = await authorization();
    const endpoint = canManage && organizationId ? `/api/hr/employees?organizationId=${encodeURIComponent(organizationId)}` : `/api/hr/project-team?projectId=${encodeURIComponent(projectId)}`;
    const response = await fetch(endpoint, { headers }); const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setError(payload.error || 'Workforce records are unavailable.'); return; }
    setEmployees(payload.employees || []); setAssignments(payload.assignments || []);
  };
  // The effect synchronizes this view with the authenticated server source.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [organizationId, projectId, canManage]);
  const filtered = useMemo(() => employees.filter(employee => `${employee.employee_code} ${employee.full_name} ${employee.designation || ''} ${employee.department || ''}`.toLowerCase().includes(query.toLowerCase())), [employees, query]);
  const assigned = new Set(assignments.filter(item => item.project_id === projectId && item.status === 'active').map(item => item.employee_id));
  const create = async (event: React.FormEvent) => {
    event.preventDefault(); if (!organizationId) return; setSaving(true); setError('');
    const response = await fetch('/api/hr/employees', { method: 'POST', headers: await authorization(), body: JSON.stringify({ action: 'create', organizationId, ...form }) });
    const payload = await response.json().catch(() => ({})); setSaving(false);
    if (!response.ok) { setError(payload.error || 'Employee could not be saved.'); return; }
    setForm({ employeeCode: '', fullName: '', designation: '', department: '', phone: '', employmentStatus: 'active', employmentType: 'full_time', joiningDate: '', location: '', tradeSkill: '' }); void load();
  };
  const assign = async (employeeId: string, active: boolean) => {
    if (!organizationId) return; setSaving(true); setError('');
    const response = await fetch('/api/hr/employees', { method: 'POST', headers: await authorization(), body: JSON.stringify({ action: 'assign', organizationId, assignment: { employeeId, projectId, status: active ? 'active' : 'inactive', startDate: new Date().toISOString().slice(0, 10) } }) });
    const payload = await response.json().catch(() => ({})); setSaving(false); if (!response.ok) setError(payload.error || 'Assignment could not be saved.'); else void load();
  };
  return <section className="space-y-5">
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="text-lg font-extrabold text-slate-900">Employee & workforce</h2><p className="mt-1 text-sm text-slate-600">Organization HR records, skills and project deployment. A work assignment never creates a login or feature access.</p></div>
    {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-900">{error}</p>}
    {canManage && <form onSubmit={create} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-3">
      <h3 className="sm:col-span-2 lg:col-span-3 font-bold text-slate-900">Add employee</h3>
      {[['employeeCode','Employee code'],['fullName','Full name'],['designation','Designation'],['department','Department'],['phone','Phone'],['location','Site / office'],['tradeSkill','Trade / skill']].map(([key,label]) => <label key={key} className="text-sm font-semibold text-slate-700">{label}<input required={key === 'employeeCode' || key === 'fullName'} value={(form as any)[key]} onChange={event => setForm({ ...form, [key]: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900" /></label>)}
      <label className="text-sm font-semibold text-slate-700">Employment type<select value={form.employmentType} onChange={event => setForm({ ...form, employmentType: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"><option value="full_time">Full time</option><option value="contract">Contract</option><option value="casual">Casual</option><option value="consultant">Consultant</option></select></label>
      <label className="text-sm font-semibold text-slate-700">Joining date<BsDatePicker value={form.joiningDate} onChange={value => setForm({ ...form, joiningDate: value })} /></label>
      <button disabled={saving} className="min-h-10 self-end rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{saving ? 'Saving…' : 'Save employee'}</button>
    </form>}
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"><h3 className="font-bold text-slate-900">{canManage ? 'Employee master' : 'Project team'}</h3><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search employee" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" /></div><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-600"><tr><th className="px-4 py-3">Employee</th><th className="px-4 py-3">Role / department</th><th className="px-4 py-3">Location</th><th className="px-4 py-3">Status</th>{canManage && <th className="px-4 py-3">This project</th>}</tr></thead><tbody>{filtered.map(employee => <tr key={employee.id} className="border-t border-slate-100"><td className="px-4 py-3 font-semibold text-slate-900">{employee.full_name}<span className="block text-xs font-normal text-slate-500">{employee.employee_code}</span></td><td className="px-4 py-3 text-slate-700">{employee.designation || '—'}<span className="block text-xs text-slate-500">{employee.department || employee.trade_skill || '—'}</span></td><td className="px-4 py-3 text-slate-700">{employee.location || '—'}</td><td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{employee.employment_status}</span></td>{canManage && <td className="px-4 py-3"><button disabled={saving} onClick={() => assign(employee.id, !assigned.has(employee.id))} className="rounded-md border border-blue-300 px-2 py-1 text-xs font-bold text-blue-800">{assigned.has(employee.id) ? 'Remove' : 'Assign'}</button></td>}</tr>)}{!filtered.length && <tr><td colSpan={canManage ? 5 : 4} className="px-4 py-8 text-center text-slate-500">No employee records yet.</td></tr>}</tbody></table></div></div>
    {canManage && organizationId && <LeaveWorkforcePanel organizationId={organizationId} projectId={projectId} />}
    {canManage && organizationId && <PayrollPanel organizationId={organizationId} />}
  </section>;
}
