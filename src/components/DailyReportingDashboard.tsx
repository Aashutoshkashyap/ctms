import React, { useMemo, useState } from 'react';
import { Activity } from '../lib/cpm';
import { SitePhoto, storage } from '../lib/storage';
import { can } from '../lib/permissions';

interface Props {
  projectId: string;
  activities: Activity[];
  reports: any[];
  currentDate: string;
  userName: string;
  userRole: string;
  onSubmit: (report: any, workItems: any[], materials: any[]) => void;
  onReload: () => void;
  onDelete?: (id: string) => void;
}

export default function DailyReportingDashboard({ projectId, activities, reports, currentDate, userName, userRole, onSubmit, onReload, onDelete }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [caption, setCaption] = useState('');
  const [evidenceType, setEvidenceType] = useState<SitePhoto['evidence_type']>('progress');
  const [photos, setPhotos] = useState<SitePhoto[]>([]);
  const [form, setForm] = useState({
    report_date: currentDate, weather: 'Clear / Sunny', manpower_total: 0, equipment_total: 0,
    site_instructions: '', obstruction_reasons: '', next_day_plan: '',
    activity_id: activities[0]?.id || '', quantity_completed: 0, activity_manpower: 0, activity_equipment: 0,
    delay_reason: '', material_name: '', material_unit: 'Bag', received_qty: 0, consumed_qty: 0, vendor: ''
  });
  const [workItems, setWorkItems] = useState<any[]>([]);
  const [materialItems, setMaterialItems] = useState<any[]>([]);
  const [editingReportId, setEditingReportId] = useState<string | null>(null);

  const sortedReports = useMemo(() => [...reports].sort((a,b)=>b.report_date.localeCompare(a.report_date)), [reports]);
  const canUpload = can(userRole, 'upload_evidence');
  const canView = can(userRole, 'view_evidence');

  React.useEffect(() => {
    let active = true;
    if (!canView) {
      setPhotos([]);
      return;
    }
    void storage.getSitePhotosForRole(userRole).then(rows => { if (active) setPhotos(rows); });
    return () => { active = false; };
  }, [projectId, userRole, canView]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const reportId = editingReportId || `rep-${Date.now()}`;
      onSubmit({
        id: reportId, report_date: form.report_date, weather: form.weather,
        manpower_total: form.manpower_total, equipment_total: form.equipment_total,
        site_instructions: form.site_instructions, obstruction_reasons: form.obstruction_reasons,
        next_day_plan: form.next_day_plan, submitted_by: userName
      }, workItems.length ? workItems : (form.activity_id ? [{
        activity_id: form.activity_id, quantity_completed: form.quantity_completed,
        manpower_count: form.activity_manpower, equipment_count: form.activity_equipment,
        delay_reason: form.delay_reason
      }] : []), materialItems.length ? materialItems : (form.material_name ? [{
        material_name: form.material_name, unit: form.material_unit, received_qty: form.received_qty,
        consumed_qty: form.consumed_qty, vendor: form.vendor
      }] : []));
      if (canUpload) {
        for (const file of files) await storage.uploadSitePhoto(file, reportId, caption, userName, evidenceType);
      }
      if (canView) setPhotos(await storage.getSitePhotosForRole(userRole));
      setFiles([]);
      setCaption('');
      setShowForm(false);
      setEditingReportId(null);
      setWorkItems([]);
      setMaterialItems([]);
      onReload();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not save daily report.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddWorkItem = () => {
    if (!form.activity_id) return;
    setWorkItems(w => [...w, {
      activity_id: form.activity_id,
      quantity_completed: Number(form.quantity_completed) || 0,
      manpower_count: Number(form.activity_manpower) || 0,
      equipment_count: Number(form.activity_equipment) || 0,
      delay_reason: form.delay_reason || ''
    }]);
    setForm({...form, activity_id: activities[0]?.id || '', quantity_completed: 0, activity_manpower: 0, activity_equipment: 0, delay_reason: ''});
  };

  const handleRemoveWorkItem = (idx: number) => setWorkItems(w => w.filter((_,i)=>i!==idx));

  const handleAddMaterial = () => {
    if (!form.material_name) return;
    setMaterialItems(m => [...m, {
      material_name: form.material_name, unit: form.material_unit, received_qty: Number(form.received_qty)||0,
      consumed_qty: Number(form.consumed_qty)||0, vendor: form.vendor||''
    }]);
    setForm({...form, material_name: '', material_unit: 'Bag', received_qty: 0, consumed_qty: 0, vendor: ''});
  };

  const handleRemoveMaterial = (idx: number) => setMaterialItems(m => m.filter((_,i)=>i!==idx));

  const startEditReport = (report: any) => {
    setEditingReportId(report.id);
    setShowForm(true);
    setForm({...form,
      report_date: report.report_date || currentDate,
      weather: report.weather || 'Clear / Sunny',
      manpower_total: report.manpower_total || 0,
      equipment_total: report.equipment_total || 0,
      site_instructions: report.site_instructions || '',
      obstruction_reasons: report.obstruction_reasons || '',
      next_day_plan: report.next_day_plan || ''
    });
    setWorkItems(storage.getDailyWorkItems(report.id));
    setMaterialItems(storage.getDailyMaterialLogs(report.id));
  };

  const handleDelete = (id: string) => {
    if (!confirm('Delete this daily report? This cannot be undone.')) return;
    if (typeof onDelete === 'function') {
      onDelete(id);
    } else {
      storage.deleteDailyReport(id);
      onReload();
    }
  };

  return <div className="space-y-5 text-xs" key={projectId}>
    <div className="flex justify-between items-center"><div><h2 className="text-base font-semibold">Daily Site Reporting</h2><p className="text-slate-400">Progress quantities, labour, plant, materials, delays, instructions and photographic evidence.</p></div><button onClick={()=>setShowForm(v=>!v)} className="bg-blue-600 px-3 py-2 rounded-lg font-semibold">+ New Daily Report</button></div>
    {showForm&&<form onSubmit={submit} className="space-y-4 bg-slate-800/60 border border-slate-700 p-4 rounded-xl">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Field label="Report Date"><input type="date" value={form.report_date} onChange={e=>setForm({...form,report_date:e.target.value})}/></Field>
        <Field label="Weather"><input value={form.weather} onChange={e=>setForm({...form,weather:e.target.value})}/></Field>
        <Field label="Total Manpower"><input type="number" value={form.manpower_total} onChange={e=>setForm({...form,manpower_total:Number(e.target.value)})}/></Field>
        <Field label="Total Equipment"><input type="number" value={form.equipment_total} onChange={e=>setForm({...form,equipment_total:Number(e.target.value)})}/></Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Site Instructions"><textarea value={form.site_instructions} onChange={e=>setForm({...form,site_instructions:e.target.value})}/></Field>
        <Field label="Obstruction / Delay Reasons"><textarea value={form.obstruction_reasons} onChange={e=>setForm({...form,obstruction_reasons:e.target.value})}/></Field>
        <Field label="Next-day Plan"><textarea value={form.next_day_plan} onChange={e=>setForm({...form,next_day_plan:e.target.value})}/></Field>
        <Field label="Photo Caption"><textarea value={caption} onChange={e=>setCaption(e.target.value)}/></Field>
      </div>
      <div className="border-t border-slate-700 pt-3"><h3 className="font-semibold text-slate-200 mb-2">Work Item</h3><div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        <Field label="Activity"><select value={form.activity_id} onChange={e=>setForm({...form,activity_id:e.target.value})}>{activities.map(activity=><option key={activity.id} value={activity.id}>{activity.wbs_code} — {activity.name}</option>)}</select></Field>
        <Field label="Quantity Done"><input type="number" value={form.quantity_completed} onChange={e=>setForm({...form,quantity_completed:Number(e.target.value)})}/></Field>
        <Field label="Manpower"><input type="number" value={form.activity_manpower} onChange={e=>setForm({...form,activity_manpower:Number(e.target.value)})}/></Field>
        <Field label="Equipment"><input type="number" value={form.activity_equipment} onChange={e=>setForm({...form,activity_equipment:Number(e.target.value)})}/></Field>
        <Field label="Delay Reason"><input value={form.delay_reason} onChange={e=>setForm({...form,delay_reason:e.target.value})}/></Field>
      </div></div>
      <div className="flex items-start gap-3 mt-2">
        <button type="button" onClick={handleAddWorkItem} className="px-3 py-1 bg-blue-600 text-white rounded">+ Add Work Item</button>
        <div className="flex-1">
          {workItems.length>0 && <div className="text-xs text-slate-300"><b className="text-slate-200">Work Items:</b>
            <ul className="mt-2 space-y-1">
              {workItems.map((w,i)=>(<li key={i} className="flex justify-between items-center bg-slate-900/40 p-2 rounded"><div className="text-slate-300">{w.quantity_completed} {activities.find(a=>a.id===w.activity_id)?.unit||''} on {activities.find(a=>a.id===w.activity_id)?.name||w.activity_id} · {w.manpower_count}p · {w.equipment_count}eq</div><button type="button" onClick={()=>handleRemoveWorkItem(i)} className="text-rose-400 text-xs">Remove</button></li>))}
            </ul>
          </div>}
        </div>
      </div>
      <div className="border-t border-slate-700 pt-3"><h3 className="font-semibold text-slate-200 mb-2">Material Movement</h3><div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        <Field label="Material"><input value={form.material_name} onChange={e=>setForm({...form,material_name:e.target.value})}/></Field>
        <Field label="Unit"><input value={form.material_unit} onChange={e=>setForm({...form,material_unit:e.target.value})}/></Field>
        <Field label="Received"><input type="number" value={form.received_qty} onChange={e=>setForm({...form,received_qty:Number(e.target.value)})}/></Field>
        <Field label="Consumed"><input type="number" value={form.consumed_qty} onChange={e=>setForm({...form,consumed_qty:Number(e.target.value)})}/></Field>
        <Field label="Vendor"><input value={form.vendor} onChange={e=>setForm({...form,vendor:e.target.value})}/></Field>
      </div></div>
      <div className="flex items-start gap-3 mt-2">
        <button type="button" onClick={handleAddMaterial} className="px-3 py-1 bg-blue-600 text-white rounded">+ Add Material</button>
        <div className="flex-1">
          {materialItems.length>0 && <div className="text-xs text-slate-300"><b className="text-slate-200">Material Items:</b>
            <ul className="mt-2 space-y-1">
              {materialItems.map((m,i)=>(<li key={i} className="flex justify-between items-center bg-slate-900/40 p-2 rounded"><div className="text-slate-300">{m.material_name} +{m.received_qty} / -{m.consumed_qty} ({m.unit})</div><button type="button" onClick={()=>handleRemoveMaterial(i)} className="text-rose-400 text-xs">Remove</button></li>))}
            </ul>
          </div>}
        </div>
      </div>
      {canUpload&&<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Verification Images (private; Director access only)"><input type="file" accept="image/*" multiple onChange={e=>setFiles(Array.from(e.target.files||[]))}/></Field>
        <Field label="Evidence Type"><select value={evidenceType} onChange={e=>setEvidenceType(e.target.value as SitePhoto['evidence_type'])}>{['progress','quality','safety','delivery','attendance','other'].map(value=><option key={value}>{value}</option>)}</select></Field>
      </div>}
      {files.length>0&&<div className="text-slate-600">{files.length} protected image(s) selected. Only the Project Director can view them after submission.</div>}
      <button disabled={saving} className="bg-emerald-600 disabled:opacity-50 px-4 py-2 rounded font-semibold">{saving?'Saving report…':'Submit Daily Report'}</button>
    </form>}
    <div className="space-y-3">{sortedReports.map(report=>{const reportPhotos=photos.filter(photo=>photo.daily_report_id===report.id);const work=storage.getDailyWorkItems(report.id);const mats=storage.getDailyMaterialLogs(report.id);const resources=storage.getDailyResourceUsage().filter(r=>r.usage_date===report.report_date);return <article key={report.id} className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-4 space-y-3">
      <div className="flex justify-between"><div><h3 className="font-bold text-slate-100">{report.report_date} · {report.weather}</h3><div className="text-slate-500">Submitted by {report.submitted_by}</div></div><div className="text-right">
        <div className="mb-1"><b>{report.manpower_total}</b> people · <b>{report.equipment_total}</b> plant</div>
        <div className="flex justify-end gap-2">
          {can(userRole,'daily_reports') && <button onClick={()=>startEditReport(report)} className="text-blue-400 hover:text-blue-300 text-xs font-semibold">Edit</button>}
          {can(userRole,'daily_reports') && <button onClick={()=>handleDelete(report.id)} className="text-rose-400 hover:text-rose-300 text-xs font-semibold">Delete</button>}
        </div>
      </div></div>
      <div className="grid md:grid-cols-3 gap-3"><Info label="Instructions" value={report.site_instructions}/><Info label="Obstructions" value={report.obstruction_reasons}/><Info label="Next Plan" value={report.next_day_plan}/></div>
      {(work.length>0||mats.length>0)&&<div className="grid md:grid-cols-2 gap-3 text-slate-400"><div><b className="text-slate-200">Work:</b> {work.map((item:any)=>`${item.quantity_completed} on ${activities.find(a=>a.id===item.activity_id)?.name||item.activity_id} (${item.manpower_count}p · ${item.equipment_count}eq)`).join(', ')}</div><div><b className="text-slate-200">Materials:</b> {mats.map((item:any)=>`${item.material_name} +${item.received_qty} / -${item.consumed_qty}`).join(', ')}</div></div>}
      {resources.length>0 && <div className="text-slate-400"><b className="text-slate-200">Equipment usage:</b> <span className="ml-2">{resources.map(r=>`${r.equipment_name} ${r.equipment_hours}h`).join(', ')}</span></div>}
      {canView&&reportPhotos.length>0&&<div className="grid grid-cols-2 md:grid-cols-4 gap-2">{reportPhotos.map(photo=><figure key={photo.id}><img src={photo.url} alt={photo.caption||photo.name} className="h-28 w-full object-cover rounded-lg border border-slate-200"/><figcaption className="text-[10px] text-slate-500 mt-1">{photo.caption||photo.name}</figcaption></figure>)}</div>}
    </article>})}</div>
  </div>;
}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="text-slate-400 space-y-1"><span className="block">{label}</span><span className="[&_input]:w-full [&_select]:w-full [&_textarea]:w-full [&_input]:bg-slate-950 [&_select]:bg-slate-950 [&_textarea]:bg-slate-950 [&_input]:border [&_select]:border [&_textarea]:border [&_input]:border-slate-700 [&_select]:border-slate-700 [&_textarea]:border-slate-700 [&_input]:p-2 [&_select]:p-2 [&_textarea]:p-2 [&_input]:rounded [&_select]:rounded [&_textarea]:rounded [&_input]:text-slate-200 [&_select]:text-slate-200 [&_textarea]:text-slate-200">{children}</span></label>}
function Info({label,value}:{label:string;value:string}){return <div className="bg-slate-900/40 rounded p-3"><div className="text-[10px] uppercase text-slate-500 font-bold">{label}</div><div className="mt-1 text-slate-300">{value||'None recorded'}</div></div>}
