import React, { useMemo, useRef, useState } from 'react';
import { Activity } from '../lib/cpm';
import { SitePhoto, storage } from '../lib/storage';
import { can } from '../lib/permissions';
import BsDatePicker from './BsDatePicker';
import { formatBsDate } from '../lib/nepaliDate';
import UploadProgress from './UploadProgress';
import { attachmentsNeedingRetry, DailySaveState, saveFailureMessage } from '../lib/dailySaveState';

interface Props {
  projectId: string;
  activities: Activity[];
  reports: any[];
  currentDate: string;
  userName: string;
  userEmail: string;
  userRole: string;
  onSubmit: (report: any, workItems: any[], materials: any[], operationId?: string) => void | Promise<void>;
  onReload: () => void;
  onDelete?: (id: string) => void | Promise<void>;
}

const nepaliDate = (date: string, _language?: 'ne' | 'en') => formatBsDate(date, { long: true });

// Keep the offline-saving surface independently releasable. Full application
// localization remains owned by the shell; this form has safe English fallbacks.
const dailyLabel = (key: string) => ({
  'daily.saved': 'Daily update saved.', 'daily.title': 'Daily Site Reporting',
  'common.close': 'Close', 'daily.new': 'New Daily Report',
  'common.saveFailed': 'Could not save the daily update.', 'common.retry': 'Retry',
  'daily.work': 'Description of Work', 'daily.quantity': 'Quantity Done',
  'daily.problem': 'Any problem today?', 'daily.noProblem': 'No problem',
  'daily.yesProblem': 'Yes, report a problem', 'daily.more': 'More details',
  'common.saving': 'Saving…', 'daily.today': "Submit today's work",
  'common.submit': 'Submit', 'daily.mySubmissions': 'My submissions',
}[key] || key);

export default function DailyReportingDashboard({ projectId, activities, reports, currentDate, userName, userEmail, userRole, onSubmit, onReload, onDelete }: Props) {
  const language = 'en' as const;
  const t = dailyLabel;
  const [showForm, setShowForm] = useState(false);
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<DailySaveState>('idle');
  const [saveError, setSaveError] = useState('');
  const uploadLock = useRef(false);
  const pendingOperationId = useRef<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [caption, setCaption] = useState('');
  const [logDate, setLogDate] = useState('');
  const [evidenceType, setEvidenceType] = useState<SitePhoto['evidence_type']>('progress');
  const [photos, setPhotos] = useState<SitePhoto[]>([]);
  const [form, setForm] = useState({
    report_date: currentDate, weather: 'Clear / Sunny', manpower_total: 0, equipment_total: 0,
    site_instructions: '', obstruction_reasons: '', next_day_plan: '',
    activity_id: activities[0]?.id || '', quantity_completed: 0, rework_quantity: 0, activity_manpower: 0, activity_equipment: 0,
    delay_reason: '', material_name: '', material_unit: 'Bag', received_qty: 0, consumed_qty: 0, vendor: ''
  });
  const [workItems, setWorkItems] = useState<any[]>([]);
  const [materialItems, setMaterialItems] = useState<any[]>([]);
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState('');
  const [hasProblem, setHasProblem] = useState(false);
  const isSimpleReporter = ['field_employee', 'subcontractor'].includes(userRole);

  const sortedReports = useMemo(() => [...reports].filter(report => !logDate || report.report_date === logDate).sort((a,b)=>b.report_date.localeCompare(a.report_date)), [reports, logDate]);
  const canUpload = can(userRole, 'upload_evidence');
  const canView = can(userRole, 'view_evidence');
  const visibleReports = isSimpleReporter
    ? sortedReports.filter(report => report.submitted_by_email === userEmail || report.submitted_by === userName)
    : sortedReports;

  React.useEffect(() => {
    let active = true;
    if (!canView) return;
    void storage.getSitePhotosForRole(userRole).then(rows => { if (active) setPhotos(rows); });
    return () => { active = false; };
  }, [projectId, userRole, canView]);
  const visiblePhotos = canView ? photos : [];
  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (uploadLock.current) return;
    uploadLock.current = true; setSaving(true); setSaveState('saving'); setSaveError('');
    try {
      const reportId = editingReportId || `rep-${Date.now()}`;
      if (!editingReportId) setEditingReportId(reportId);
      const existingReport = reports.find(report => report.id === reportId);
      const operationId = pendingOperationId.current || `daily-work-${projectId}-${reportId}-${crypto.randomUUID()}`;
      pendingOperationId.current = operationId;
      const reportPayload = {
        id: reportId, report_date: form.report_date, weather: form.weather,
        manpower_total: form.manpower_total, equipment_total: form.equipment_total,
        site_instructions: form.site_instructions, obstruction_reasons: form.obstruction_reasons,
        next_day_plan: form.next_day_plan, submitted_by: userName, submitted_by_email: userEmail,
        revision: Number(existingReport?.revision || 0),
      };
      const workPayload = workItems.length ? workItems : (form.activity_id ? [{
        activity_id: form.activity_id, quantity_completed: form.quantity_completed,
        rework_quantity: form.rework_quantity,
        manpower_count: form.activity_manpower, equipment_count: form.activity_equipment,
        delay_reason: form.delay_reason
      }] : []);
      const materialPayload = materialItems.length ? materialItems : (form.material_name ? [{
        material_name: form.material_name, unit: form.material_unit, received_qty: form.received_qty,
        consumed_qty: form.consumed_qty, vendor: form.vendor
      }] : []);
      // The record is preserved locally before any network attempt. The same
      // operation ID is retained by retry so cloud upserts cannot duplicate it.
      storage.enqueueDailyWorkMutation({ projectId, report: reportPayload, workItems: workPayload, materialItems: materialPayload, operationId });
      await onSubmit({
        ...reportPayload,
      }, workPayload, materialPayload, operationId);
      const sync = await storage.flushDurableMutations(projectId);
      if (!sync.ok && storage.isSupabaseConfigured()) throw new Error(sync.message || 'The daily update is stored on this device and will retry when your connection returns.');
      if (canUpload && files.length) {
        const attempts = [];
        for (const file of files) {
          try {
            const photo = await storage.uploadSitePhoto(file, reportId, caption, userName, evidenceType);
            attempts.push({ file, cloudConfirmed: !storage.isSupabaseConfigured() || Boolean(photo.storage_path) });
          } catch {
            attempts.push({ file, cloudConfirmed: false });
          }
        }
        const retryFiles = attachmentsNeedingRetry(attempts);
        setFiles(retryFiles);
        if (retryFiles.length) throw new Error('The daily update was saved, but one or more images are not confirmed in cloud storage. Keep this page open and retry the evidence upload.');
      }
      if (canView) setPhotos(await storage.getSitePhotosForRole(userRole));
      setFiles([]);
      setCaption('');
      setShowForm(false);
      setShowMoreDetails(false);
      setEditingReportId(null);
      setWorkItems([]);
      setMaterialItems([]);
      pendingOperationId.current = null;
      setSavedMessage(t('daily.saved'));
      setSaveState('saved');
      onReload();
    } catch (error) {
      setSaveError(saveFailureMessage(error));
      setSaveState('failed');
    } finally {
      uploadLock.current = false;
      setSaving(false);
    }
  };

  const handleAddWorkItem = () => {
    if (!form.activity_id) return;
    setWorkItems(w => [...w, {
      activity_id: form.activity_id,
      quantity_completed: Number(form.quantity_completed) || 0,
      rework_quantity: Number(form.rework_quantity) || 0,
      manpower_count: Number(form.activity_manpower) || 0,
      equipment_count: Number(form.activity_equipment) || 0,
      delay_reason: form.delay_reason || ''
    }]);
    setForm({...form, activity_id: activities[0]?.id || '', quantity_completed: 0, rework_quantity: 0, activity_manpower: 0, activity_equipment: 0, delay_reason: ''});
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
    setShowMoreDetails(true);
    setHasProblem(Boolean(report.obstruction_reasons));
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

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this daily report? This cannot be undone.')) return;
    try {
      if (typeof onDelete === 'function') {
        await onDelete(id);
      } else {
        await storage.deleteDailyReport(id);
        onReload();
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not delete the daily report.');
    }
  };
  const canManageReport = (report: any) => {
    const broadRoles = ['project_director','project_manager','planning_engineer','site_engineer'];
    return broadRoles.includes(userRole) || report.submitted_by_email === userEmail || report.submitted_by === userName;
  };

  return <div className="space-y-5 text-xs" key={projectId}><UploadProgress active={saving} label={files.length ? `Uploading ${files.length} protected image(s) and saving the daily report…` : 'Saving the daily report…'}/>
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between"><div><h2 className="text-base font-semibold">{t('daily.title')}</h2><p className="text-slate-500">{isSimpleReporter ? 'Record today’s work in a few clear steps. You can add more detail only when needed.' : 'Progress quantities, labour, plant, materials, delays, instructions and photographic evidence.'}</p></div><div className="flex flex-wrap items-end gap-2"><Field label="Filter logs by date (BS)"><BsDatePicker value={logDate} onChange={setLogDate}/></Field><button onClick={()=>setShowForm(v=>!v)} className="min-h-11 bg-blue-600 px-4 py-2 rounded-lg font-semibold">{showForm ? t('common.close') : t('daily.new')}</button></div></div>
    {savedMessage && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-950">{savedMessage}</div>}
    {saveState === 'failed' && <div role="alert" className="flex flex-col gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-950 sm:flex-row sm:items-center sm:justify-between"><span>{saveError || t('common.saveFailed')}</span><button type="button" onClick={() => void submit()} disabled={saving} className="min-h-10 rounded-lg bg-rose-700 px-3 py-2 font-bold text-white disabled:opacity-50">{t('common.retry')}</button></div>}
    {showForm&&<form onSubmit={submit} className="space-y-4 bg-slate-800/60 border border-slate-700 p-4 rounded-xl">
      {isSimpleReporter && <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950"><b>Today’s work:</b> choose the work item, enter quantity, add a photo if useful, then submit. Use more details only for labour, materials or instructions.</div>}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Field label="Report Date (BS)"><BsDatePicker value={form.report_date} onChange={report_date=>setForm({...form,report_date})}/></Field>
        {(!isSimpleReporter || showMoreDetails) && <><Field label="Weather"><input value={form.weather} onChange={e=>setForm({...form,weather:e.target.value})}/></Field>
        <Field label="Total Manpower"><input type="number" value={form.manpower_total || ''} onChange={e=>setForm({...form,manpower_total:Number(e.target.value)})}/></Field>
        <Field label="Total Equipment"><input type="number" value={form.equipment_total || ''} onChange={e=>setForm({...form,equipment_total:Number(e.target.value)})}/></Field></>}
      </div>
      {(!isSimpleReporter || showMoreDetails) && <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Site Instructions"><textarea value={form.site_instructions} onChange={e=>setForm({...form,site_instructions:e.target.value})}/></Field>
        <Field label="Obstruction / Delay Reasons"><textarea value={form.obstruction_reasons} onChange={e=>setForm({...form,obstruction_reasons:e.target.value})}/></Field>
        <Field label="Next-day Plan"><textarea value={form.next_day_plan} onChange={e=>setForm({...form,next_day_plan:e.target.value})}/></Field>
        <Field label="Photo Caption"><textarea value={caption} onChange={e=>setCaption(e.target.value)}/></Field>
      </div>}
      <div className="border-t border-slate-700 pt-3"><h3 className="font-semibold text-slate-200 mb-2">Work Item</h3><div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        <Field label={t('daily.work')}><select value={form.activity_id} onChange={e=>setForm({...form,activity_id:e.target.value})}>{activities.map(activity=><option key={activity.id} value={activity.id}>{activity.wbs_code} — {activity.name}</option>)}</select></Field>
        <Field label={t('daily.quantity')}><input type="number" min="0" value={form.quantity_completed || ''} onChange={e=>setForm({...form,quantity_completed:Number(e.target.value)})}/><span className="mt-1 block text-xs text-slate-500">{activities.find(activity => activity.id === form.activity_id)?.unit || ''}</span></Field>
        {(!isSimpleReporter || showMoreDetails) && <><Field label="Rework Quantity"><input type="number" value={form.rework_quantity || ''} onChange={e=>setForm({...form,rework_quantity:Number(e.target.value)})}/></Field>
        <Field label="Manpower"><input type="number" value={form.activity_manpower || ''} onChange={e=>setForm({...form,activity_manpower:Number(e.target.value)})}/></Field>
        <Field label="Equipment"><input type="number" value={form.activity_equipment || ''} onChange={e=>setForm({...form,activity_equipment:Number(e.target.value)})}/></Field></>}
        {isSimpleReporter ? <Field label={t('daily.problem')}><select value={hasProblem ? 'yes' : 'no'} onChange={e=>setHasProblem(e.target.value === 'yes')}><option value="no">{t('daily.noProblem')}</option><option value="yes">{t('daily.yesProblem')}</option></select>{hasProblem && <input className="mt-2" value={form.delay_reason} onChange={e=>setForm({...form,delay_reason:e.target.value})}/>}</Field> : <Field label="Delay Reason"><input value={form.delay_reason} onChange={e=>setForm({...form,delay_reason:e.target.value})}/></Field>}
      </div></div>
      <div className="flex items-start gap-3 mt-2">
        <button type="button" onClick={handleAddWorkItem} className="px-3 py-1 bg-blue-600 text-white rounded">+ Add Work Item</button>
        <div className="flex-1">
          {workItems.length>0 && <div className="text-xs text-slate-300"><b className="text-slate-200">Work Items:</b>
            <ul className="mt-2 space-y-1">
              {workItems.map((w,i)=>(<li key={i} className="flex justify-between items-center bg-slate-900/40 p-2 rounded"><div className="text-slate-300">{w.quantity_completed} {activities.find(a=>a.id===w.activity_id)?.unit||''} on {activities.find(a=>a.id===w.activity_id)?.name||w.activity_id}{w.rework_quantity ? ` · rework ${w.rework_quantity}` : ''} · {w.manpower_count}p · {w.equipment_count}eq</div><button type="button" onClick={()=>handleRemoveWorkItem(i)} className="text-rose-400 text-xs">Remove</button></li>))}
            </ul>
          </div>}
        </div>
      </div>
      {(!isSimpleReporter || showMoreDetails) && <><div className="border-t border-slate-700 pt-3"><h3 className="font-semibold text-slate-200 mb-2">Material Movement</h3><div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        <Field label="Material"><input value={form.material_name} onChange={e=>setForm({...form,material_name:e.target.value})}/></Field>
        <Field label="Unit"><input value={form.material_unit} onChange={e=>setForm({...form,material_unit:e.target.value})}/></Field>
        <Field label="Received"><input type="number" value={form.received_qty || ''} onChange={e=>setForm({...form,received_qty:Number(e.target.value)})}/></Field>
        <Field label="Consumed"><input type="number" value={form.consumed_qty || ''} onChange={e=>setForm({...form,consumed_qty:Number(e.target.value)})}/></Field>
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
      </div></>}
      {canUpload&&<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Verification Images (private; Director access only)"><input type="file" accept="image/*" multiple onChange={e=>setFiles(Array.from(e.target.files||[]))}/></Field>
        <Field label="Evidence Type"><select value={evidenceType} onChange={e=>setEvidenceType(e.target.value as SitePhoto['evidence_type'])}>{['progress','quality','safety','delivery','attendance','other'].map(value=><option key={value}>{value}</option>)}</select></Field>
      </div>}
      {files.length>0&&<div className="text-slate-600">{files.length} protected image(s) selected. Only the Project Director can view them after submission.</div>}
      {isSimpleReporter && <button type="button" onClick={() => setShowMoreDetails(value => !value)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-700">{showMoreDetails ? 'Hide more details' : t('daily.more')}</button>}
      <button disabled={saving} className="min-h-11 bg-emerald-600 disabled:opacity-50 px-4 py-2 rounded font-semibold">{saving ? t('common.saving') : isSimpleReporter ? t('daily.today') : t('common.submit')}</button>
    </form>}
    {isSimpleReporter && <h3 className="text-base font-bold text-slate-900">{t('daily.mySubmissions')}</h3>}{!isSimpleReporter && <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[960px] text-sm">
        <thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">{['Date (BS)','People/Plant','Work done','Materials','Instructions / Delays','Actions'].map(title=><th key={title} className="p-3">{title}</th>)}</tr></thead>
        <tbody>{visibleReports.map(report=>{const work=storage.getDailyWorkItems(report.id);const mats=storage.getDailyMaterialLogs(report.id);return <tr key={report.id} className="border-b border-slate-100 align-top">
          <td className="p-3 font-mono"><b>{nepaliDate(report.report_date, language)}</b><div className="text-xs text-slate-500">{report.weather}</div><div className="text-xs text-slate-500">By {report.submitted_by}</div></td>
          <td className="p-3">{report.manpower_total} people<br />{report.equipment_total} plant</td>
          <td className="p-3">{work.length ? work.map((item:any)=>`${item.quantity_completed}${item.rework_quantity ? ` (rework ${item.rework_quantity})` : ''} on ${activities.find(a=>a.id===item.activity_id)?.name||item.activity_id}`).join(', ') : '—'}</td>
          <td className="p-3">{mats.length ? mats.map((item:any)=>`${item.material_name} +${item.received_qty} / -${item.consumed_qty}`).join(', ') : '—'}</td>
          <td className="p-3"><b>Instruction:</b> {report.site_instructions || '—'}<br /><b>Delay:</b> {report.obstruction_reasons || '—'}</td>
          <td className="p-3"><div className="flex gap-2">{canManageReport(report) && <button onClick={()=>startEditReport(report)} className="text-blue-700 font-bold">Edit</button>}{canManageReport(report) && <button onClick={()=>handleDelete(report.id)} className="text-rose-700 font-bold">Delete</button>}</div></td>
        </tr>})}</tbody>
      </table>
    </div>}
    {isSimpleReporter && <div className="space-y-3">{visibleReports.map(report=>{const reportPhotos=visiblePhotos.filter(photo=>photo.daily_report_id===report.id);const work=storage.getDailyWorkItems(report.id);const mats=storage.getDailyMaterialLogs(report.id);const resources=storage.getDailyResourceUsage().filter(r=>r.usage_date===report.report_date);return <article key={report.id} className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-4 space-y-3">
      <div className="flex justify-between"><div><h3 className="font-bold text-slate-100">{nepaliDate(report.report_date, language)} · {report.weather}</h3><div className="text-slate-500">Submitted by {report.submitted_by}</div></div><div className="text-right">
        <div className="mb-1"><b>{report.manpower_total}</b> people · <b>{report.equipment_total}</b> plant</div>
        <div className="flex justify-end gap-2">
          {canManageReport(report) && <button onClick={()=>startEditReport(report)} className="text-blue-400 hover:text-blue-300 text-xs font-semibold">Edit</button>}
          {canManageReport(report) && <button onClick={()=>handleDelete(report.id)} className="text-rose-400 hover:text-rose-300 text-xs font-semibold">Delete</button>}
        </div>
      </div></div>
      <div className="grid md:grid-cols-3 gap-3"><Info label="Instructions" value={report.site_instructions}/><Info label="Obstructions" value={report.obstruction_reasons}/><Info label="Next Plan" value={report.next_day_plan}/></div>
      {(work.length>0||mats.length>0)&&<div className="grid md:grid-cols-2 gap-3 text-slate-400"><div><b className="text-slate-200">Work:</b> {work.map((item:any)=>`${item.quantity_completed}${item.rework_quantity ? `, rework ${item.rework_quantity}` : ''} on ${activities.find(a=>a.id===item.activity_id)?.name||item.activity_id} (${item.manpower_count}p · ${item.equipment_count}eq)`).join(', ')}</div><div><b className="text-slate-200">Materials:</b> {mats.map((item:any)=>`${item.material_name} +${item.received_qty} / -${item.consumed_qty}`).join(', ')}</div></div>}
      {resources.length>0 && <div className="text-slate-400"><b className="text-slate-200">Equipment usage:</b> <span className="ml-2">{resources.map(r=>`${r.equipment_name} ${r.equipment_hours}h`).join(', ')}</span></div>}
      {canView&&reportPhotos.length>0&&<div className="grid grid-cols-2 md:grid-cols-4 gap-2">{reportPhotos.map(photo=><figure key={photo.id}><img src={photo.url} alt={photo.caption||photo.name} className="h-28 w-full object-cover rounded-lg border border-slate-200"/><figcaption className="text-[10px] text-slate-500 mt-1">{photo.caption||photo.name}</figcaption></figure>)}</div>}
    </article>})}</div>}
  </div>;
}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="text-slate-400 space-y-1"><span className="block">{label}</span><span className="[&_input]:w-full [&_select]:w-full [&_textarea]:w-full [&_input]:bg-slate-950 [&_select]:bg-slate-950 [&_textarea]:bg-slate-950 [&_input]:border [&_select]:border [&_textarea]:border [&_input]:border-slate-700 [&_select]:border-slate-700 [&_textarea]:border-slate-700 [&_input]:p-2 [&_select]:p-2 [&_textarea]:p-2 [&_input]:rounded [&_select]:rounded [&_textarea]:rounded [&_input]:text-slate-200 [&_select]:text-slate-200 [&_textarea]:text-slate-200">{children}</span></label>}
function Info({label,value}:{label:string;value:string}){return <div className="bg-slate-900/40 rounded p-3"><div className="text-[10px] uppercase text-slate-500 font-bold">{label}</div><div className="mt-1 text-slate-300">{value||'None recorded'}</div></div>}
