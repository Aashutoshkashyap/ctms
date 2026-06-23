import React, { useMemo, useState } from 'react';
import { Activity } from '../lib/cpm';
import { DailyResourceUsage, EmployeeVisit, storage } from '../lib/storage';
import { can } from '../lib/permissions';

interface Props {
  projectId: string;
  role: string;
  userName: string;
  activities: Activity[];
}

const today = () => new Date().toISOString().slice(0, 10);

export default function OperationalControlDashboard({ projectId, role, userName, activities }: Props) {
  const [usage, setUsage] = useState<DailyResourceUsage[]>(() => storage.getDailyResourceUsage());
  const [visits, setVisits] = useState<EmployeeVisit[]>(() => storage.getEmployeeVisits());
  const [showUsage, setShowUsage] = useState(false);
  const [showVisit, setShowVisit] = useState(false);
  const [resource, setResource] = useState({
    usage_date: today(), activity_id: activities[0]?.id || '', location: '',
    manpower_skilled: 0, manpower_unskilled: 0, equipment_name: 'Excavator',
    equipment_hours: 0, fuel_litres: 0, work_quantity: 0, work_unit: 'm³',
    excavator_start_meter: 0, excavator_end_meter: 0, excavator_output: 0,
    downtime_hours: 0, remarks: '', recorded_by: userName,
  });
  const [visit, setVisit] = useState({
    visit_date: today(), employee_name: '', employee_role: '', site_location: '',
    check_in: '08:00', check_out: '17:00', purpose: '', vehicle_number: '',
    status: 'planned' as EmployeeVisit['status'], recorded_by: userName,
  });
  const canRecordResources = can(role, 'operations') && !['employer_viewer', 'jv_partner'].includes(role);
  const canTrackEmployees = can(role, 'employee_tracking');

  const summary = useMemo(() => {
    const fuel = usage.reduce((sum, row) => sum + row.fuel_litres, 0);
    const work = usage.reduce((sum, row) => sum + row.work_quantity, 0);
    const excavatorHours = usage.reduce((sum, row) => sum + Math.max(0, row.excavator_end_meter - row.excavator_start_meter), 0);
    const excavatorOutput = usage.reduce((sum, row) => sum + row.excavator_output, 0);
    return {
      manpower: usage.reduce((sum, row) => sum + row.manpower_skilled + row.manpower_unskilled, 0),
      equipmentHours: usage.reduce((sum, row) => sum + row.equipment_hours, 0),
      fuel,
      work,
      workPerFuel: fuel ? work / fuel : 0,
      excavatorEfficiency: excavatorHours ? excavatorOutput / excavatorHours : 0,
      activeVisits: visits.filter(row => row.status === 'on_site').length,
    };
  }, [usage, visits]);

  const saveResource = (event: React.FormEvent) => {
    event.preventDefault();
    storage.saveDailyResourceUsage(resource);
    setUsage(storage.getDailyResourceUsage());
    setShowUsage(false);
  };
  const saveVisit = (event: React.FormEvent) => {
    event.preventDefault();
    storage.saveEmployeeVisit(visit);
    setVisits(storage.getEmployeeVisits());
    setShowVisit(false);
  };

  return <div className="space-y-5" key={projectId}>
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div><h2 className="text-xl font-extrabold text-slate-900">Daily Resources, Productivity & Site Visits</h2><p className="text-slate-500">One operational record for work completed, manpower, equipment, fuel, plant efficiency and employee movement.</p></div>
      <div className="flex flex-wrap gap-2">
        {canRecordResources && <button onClick={() => setShowUsage(value => !value)} className="rounded-lg bg-blue-600 px-4 py-2 font-bold text-white">+ Daily Usage</button>}
        {canTrackEmployees && <button onClick={() => setShowVisit(value => !value)} className="rounded-lg bg-emerald-600 px-4 py-2 font-bold text-white">+ Site Visit</button>}
      </div>
    </div>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
      <Metric label="Manpower Logged" value={summary.manpower.toLocaleString()} />
      <Metric label="Equipment Hours" value={summary.equipmentHours.toFixed(1)} />
      <Metric label="Fuel Used" value={`${summary.fuel.toFixed(1)} L`} />
      <Metric label="Work / Fuel" value={`${summary.workPerFuel.toFixed(2)} unit/L`} />
      <Metric label="Excavator Output" value={`${summary.excavatorEfficiency.toFixed(2)} unit/hr`} />
      <Metric label="Currently On Site" value={String(summary.activeVisits)} />
    </div>

    {showUsage && <form onSubmit={saveResource} className="rounded-xl border border-blue-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 font-bold text-slate-900">Daily equipment, manpower and completed-work input</h3>
      <div className="grid gap-3 md:grid-cols-4">
        <Field label="Date"><input type="date" required value={resource.usage_date} onChange={e => setResource({ ...resource, usage_date: e.target.value })} /></Field>
        <Field label="Activity"><select value={resource.activity_id} onChange={e => setResource({ ...resource, activity_id: e.target.value })}>{activities.map(item => <option key={item.id} value={item.id}>{item.wbs_code} — {item.name}</option>)}</select></Field>
        <Field label="Site / Chainage"><input required value={resource.location} onChange={e => setResource({ ...resource, location: e.target.value })} /></Field>
        <Field label="Equipment"><input value={resource.equipment_name} onChange={e => setResource({ ...resource, equipment_name: e.target.value })} /></Field>
        <Field label="Skilled Manpower"><input type="number" min="0" value={resource.manpower_skilled} onChange={e => setResource({ ...resource, manpower_skilled: Number(e.target.value) })} /></Field>
        <Field label="Unskilled Manpower"><input type="number" min="0" value={resource.manpower_unskilled} onChange={e => setResource({ ...resource, manpower_unskilled: Number(e.target.value) })} /></Field>
        <Field label="Equipment Hours"><input type="number" min="0" step="0.1" value={resource.equipment_hours} onChange={e => setResource({ ...resource, equipment_hours: Number(e.target.value) })} /></Field>
        <Field label="Fuel Used (L)"><input type="number" min="0" step="0.1" value={resource.fuel_litres} onChange={e => setResource({ ...resource, fuel_litres: Number(e.target.value) })} /></Field>
        <Field label="Work Completed"><input type="number" min="0" step="0.01" value={resource.work_quantity} onChange={e => setResource({ ...resource, work_quantity: Number(e.target.value) })} /></Field>
        <Field label="Work Unit"><input value={resource.work_unit} onChange={e => setResource({ ...resource, work_unit: e.target.value })} /></Field>
        <Field label="Excavator Start Meter"><input type="number" min="0" step="0.1" value={resource.excavator_start_meter} onChange={e => setResource({ ...resource, excavator_start_meter: Number(e.target.value) })} /></Field>
        <Field label="Excavator End Meter"><input type="number" min="0" step="0.1" value={resource.excavator_end_meter} onChange={e => setResource({ ...resource, excavator_end_meter: Number(e.target.value) })} /></Field>
        <Field label="Excavator Output"><input type="number" min="0" step="0.1" value={resource.excavator_output} onChange={e => setResource({ ...resource, excavator_output: Number(e.target.value) })} /></Field>
        <Field label="Downtime Hours"><input type="number" min="0" step="0.1" value={resource.downtime_hours} onChange={e => setResource({ ...resource, downtime_hours: Number(e.target.value) })} /></Field>
        <Field label="Remarks"><input value={resource.remarks} onChange={e => setResource({ ...resource, remarks: e.target.value })} /></Field>
      </div>
      <button className="mt-4 rounded-lg bg-blue-600 px-4 py-2 font-bold text-white">Save Daily Operational Record</button>
    </form>}

    {showVisit && <form onSubmit={saveVisit} className="rounded-xl border border-emerald-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 font-bold text-slate-900">Employee and site-visit tracking</h3>
      <div className="grid gap-3 md:grid-cols-4">
        <Field label="Visit Date"><input type="date" required value={visit.visit_date} onChange={e => setVisit({ ...visit, visit_date: e.target.value })} /></Field>
        <Field label="Employee"><input required value={visit.employee_name} onChange={e => setVisit({ ...visit, employee_name: e.target.value })} /></Field>
        <Field label="Role / Team"><input required value={visit.employee_role} onChange={e => setVisit({ ...visit, employee_role: e.target.value })} /></Field>
        <Field label="Site Location"><input required value={visit.site_location} onChange={e => setVisit({ ...visit, site_location: e.target.value })} /></Field>
        <Field label="Check In"><input type="time" value={visit.check_in} onChange={e => setVisit({ ...visit, check_in: e.target.value })} /></Field>
        <Field label="Check Out"><input type="time" value={visit.check_out} onChange={e => setVisit({ ...visit, check_out: e.target.value })} /></Field>
        <Field label="Purpose"><input value={visit.purpose} onChange={e => setVisit({ ...visit, purpose: e.target.value })} /></Field>
        <Field label="Vehicle / Travel Ref"><input value={visit.vehicle_number} onChange={e => setVisit({ ...visit, vehicle_number: e.target.value })} /></Field>
        <Field label="Status"><select value={visit.status} onChange={e => setVisit({ ...visit, status: e.target.value as EmployeeVisit['status'] })}>{['planned', 'on_site', 'completed', 'cancelled'].map(value => <option key={value}>{value}</option>)}</select></Field>
      </div>
      <button className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 font-bold text-white">Save Visit Record</button>
    </form>}

    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 font-bold text-slate-900">Fuel vs work and excavator efficiency comparison</h3>
      <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-sm"><thead><tr>{['Date', 'Activity / Location', 'Manpower', 'Plant Hours', 'Fuel', 'Work Completed', 'Work / Litre', 'Excavator Hours', 'Excavator Output / Hr', 'Remarks'].map(title => <th key={title} className="border-b border-slate-200 p-2 text-left text-xs text-slate-500">{title}</th>)}</tr></thead>
        <tbody>{[...usage].sort((a, b) => b.usage_date.localeCompare(a.usage_date)).map(row => {
          const excavatorHours = Math.max(0, row.excavator_end_meter - row.excavator_start_meter);
          return <tr key={row.id} className="border-b border-slate-100"><td className="p-2 font-mono">{row.usage_date}</td><td className="p-2"><b>{activities.find(item => item.id === row.activity_id)?.name || 'General works'}</b><div className="text-xs text-slate-500">{row.location}</div></td><td className="p-2">{row.manpower_skilled + row.manpower_unskilled}</td><td className="p-2">{row.equipment_hours}</td><td className="p-2">{row.fuel_litres} L</td><td className="p-2">{row.work_quantity} {row.work_unit}</td><td className="p-2 font-bold text-blue-700">{row.fuel_litres ? (row.work_quantity / row.fuel_litres).toFixed(2) : '—'}</td><td className="p-2">{excavatorHours.toFixed(1)}</td><td className="p-2 font-bold text-emerald-700">{excavatorHours ? (row.excavator_output / excavatorHours).toFixed(2) : '—'}</td><td className="p-2 text-slate-600">{row.remarks || '—'}</td></tr>;
        })}</tbody></table></div>
    </section>

    {canTrackEmployees && <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 font-bold text-slate-900">Employee movement and site visits</h3>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{[...visits].sort((a, b) => b.visit_date.localeCompare(a.visit_date)).map(row => <div key={row.id} className="rounded-lg border border-slate-200 p-3"><div className="flex justify-between"><b>{row.employee_name}</b><span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-bold capitalize text-blue-700">{row.status.replace('_', ' ')}</span></div><div className="mt-1 text-sm text-slate-600">{row.employee_role} · {row.site_location}</div><div className="mt-2 text-xs text-slate-500">{row.visit_date} · {row.check_in}–{row.check_out} · {row.purpose || 'General visit'}</div></div>)}</div>
    </section>}
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-xs font-bold uppercase text-slate-500">{label}</div><div className="mt-1 text-xl font-extrabold text-slate-900">{value}</div></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="space-y-1 text-sm font-semibold text-slate-600"><span className="block">{label}</span><span className="[&_input]:w-full [&_select]:w-full [&_input]:rounded-lg [&_select]:rounded-lg [&_input]:border [&_select]:border [&_input]:border-slate-300 [&_select]:border-slate-300 [&_input]:bg-white [&_select]:bg-white [&_input]:p-2.5 [&_select]:p-2.5 [&_input]:text-slate-900 [&_select]:text-slate-900">{children}</span></label>; }
