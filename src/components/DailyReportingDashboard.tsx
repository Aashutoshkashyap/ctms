import React, { useMemo, useRef, useState } from 'react';
import { Activity } from '../lib/cpm';
import { SitePhoto, storage } from '../lib/storage';
import { can } from '../lib/permissions';
import BsDatePicker from './BsDatePicker';
import { formatBsDate } from '../lib/nepaliDate';
import UploadProgress from './UploadProgress';
import { attachmentsNeedingRetry, DailySaveState, saveFailureMessage } from '../lib/dailySaveState';
import RecordDetailsDialog from './RecordDetailsDialog';

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
  const [selectedReport, setSelectedReport] = useState<any | null>(null);
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

  return (
    <div className="space-y-6 text-xs" key={projectId}>
      <UploadProgress active={saving} label={files.length ? `Uploading ${files.length} protected image(s) and saving the daily report…` : 'Saving the daily report…'} />

      {/* Header toolbar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-blue-600 text-base">📝</span>
            <h2 className="text-base font-bold text-slate-900">{t('daily.title')}</h2>
          </div>
          <p className="text-slate-500 text-xs max-w-2xl">
            {isSimpleReporter
              ? 'Record today’s work in a few clear steps. Add more detail only when needed.'
              : 'Progress quantities, labour, plant, materials, delays, site instructions and photographic evidence.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1">
            <span className="text-slate-400 text-xs">📅</span>
            <BsDatePicker value={logDate} onChange={setLogDate} />
          </div>
          <button
            onClick={() => setShowForm(v => !v)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition shadow-xs flex items-center gap-1.5"
          >
            <span>{showForm ? '✕' : '+'}</span>
            <span>{showForm ? t('common.close') : t('daily.new')}</span>
          </button>
        </div>
      </div>

      {savedMessage && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-bold text-emerald-800 flex items-center gap-2">
          <span>✓</span>
          <span>{savedMessage}</span>
        </div>
      )}

      {saveState === 'failed' && (
        <div role="alert" className="flex flex-col gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-950 sm:flex-row sm:items-center sm:justify-between">
          <span className="font-semibold">{saveError || t('common.saveFailed')}</span>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving}
            className="rounded-lg bg-rose-700 px-3 py-1.5 font-bold text-white hover:bg-rose-800 transition disabled:opacity-50"
          >
            {t('common.retry')}
          </button>
        </div>
      )}

      {/* Daily report submission form */}
      {showForm && (
        <form onSubmit={submit} className="space-y-5 bg-white border border-slate-200 p-5 rounded-2xl shadow-xs">
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-sm">
              {editingReportId ? 'Edit Daily Report' : 'New Daily Site Report'}
            </h3>
            <span className="text-[11px] text-slate-400">Step 1 of 2</span>
          </div>

          {isSimpleReporter && (
            <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-950 font-medium">
              💡 <b>Fast Site Intake:</b> Choose the work item, enter quantity, and submit. Reveal more details below if reporting materials or obstacles.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Report Date (BS)">
              <BsDatePicker value={form.report_date} onChange={report_date => setForm({ ...form, report_date })} />
            </Field>
            {(!isSimpleReporter || showMoreDetails) && (
              <>
                <Field label="Weather Condition">
                  <input value={form.weather} onChange={e => setForm({ ...form, weather: e.target.value })} />
                </Field>
                <Field label="Total Site Manpower">
                  <input type="number" min="0" value={form.manpower_total || ''} onChange={e => setForm({ ...form, manpower_total: Number(e.target.value) })} />
                </Field>
                <Field label="Total Active Equipment">
                  <input type="number" min="0" value={form.equipment_total || ''} onChange={e => setForm({ ...form, equipment_total: Number(e.target.value) })} />
                </Field>
              </>
            )}
          </div>

          {(!isSimpleReporter || showMoreDetails) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              <Field label="Site Instructions Received">
                <textarea rows={2} value={form.site_instructions} onChange={e => setForm({ ...form, site_instructions: e.target.value })} />
              </Field>
              <Field label="Obstructions / Delay Reasons">
                <textarea rows={2} value={form.obstruction_reasons} onChange={e => setForm({ ...form, obstruction_reasons: e.target.value })} />
              </Field>
              <Field label="Next-Day Work Plan">
                <textarea rows={2} value={form.next_day_plan} onChange={e => setForm({ ...form, next_day_plan: e.target.value })} />
              </Field>
              <Field label="Photo Caption / Remarks">
                <textarea rows={2} value={caption} onChange={e => setCaption(e.target.value)} />
              </Field>
            </div>
          )}

          {/* Work Item Progress */}
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <div className="font-bold text-slate-800 text-xs uppercase tracking-wider">Work Item Progress</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
              <Field label={t('daily.work')}>
                <select value={form.activity_id} onChange={e => setForm({ ...form, activity_id: e.target.value })}>
                  {activities.map(activity => (
                    <option key={activity.id} value={activity.id}>
                      {activity.wbs_code} — {activity.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('daily.quantity')}>
                <input
                  type="number"
                  min="0"
                  value={form.quantity_completed || ''}
                  onChange={e => setForm({ ...form, quantity_completed: Number(e.target.value) })}
                />
                <span className="mt-1 block text-[11px] text-slate-500">
                  Unit: {activities.find(activity => activity.id === form.activity_id)?.unit || 'units'}
                </span>
              </Field>
              {(!isSimpleReporter || showMoreDetails) && (
                <>
                  <Field label="Rework Qty">
                    <input type="number" min="0" value={form.rework_quantity || ''} onChange={e => setForm({ ...form, rework_quantity: Number(e.target.value) })} />
                  </Field>
                  <Field label="Assigned Men">
                    <input type="number" min="0" value={form.activity_manpower || ''} onChange={e => setForm({ ...form, activity_manpower: Number(e.target.value) })} />
                  </Field>
                  <Field label="Assigned Plant">
                    <input type="number" min="0" value={form.activity_equipment || ''} onChange={e => setForm({ ...form, activity_equipment: Number(e.target.value) })} />
                  </Field>
                </>
              )}
              {isSimpleReporter ? (
                <Field label={t('daily.problem')}>
                  <select value={hasProblem ? 'yes' : 'no'} onChange={e => setHasProblem(e.target.value === 'yes')}>
                    <option value="no">{t('daily.noProblem')}</option>
                    <option value="yes">{t('daily.yesProblem')}</option>
                  </select>
                  {hasProblem && (
                    <input className="mt-2" placeholder="Specify problem..." value={form.delay_reason} onChange={e => setForm({ ...form, delay_reason: e.target.value })} />
                  )}
                </Field>
              ) : (
                <Field label="Delay Reason">
                  <input placeholder="Delay explanation (if any)" value={form.delay_reason} onChange={e => setForm({ ...form, delay_reason: e.target.value })} />
                </Field>
              )}
            </div>

            <div className="flex items-start gap-3 pt-2">
              <button
                type="button"
                onClick={handleAddWorkItem}
                className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-xl transition"
              >
                + Add Work Item
              </button>
              <div className="flex-1">
                {workItems.length > 0 && (
                  <div className="space-y-1">
                    <span className="font-bold text-slate-700">Scheduled Work Items to Submit:</span>
                    <ul className="mt-1 space-y-1">
                      {workItems.map((w, i) => (
                        <li key={i} className="flex justify-between items-center bg-slate-50 border border-slate-200 p-2 rounded-xl">
                          <span className="text-slate-800">
                            <b>{w.quantity_completed} {activities.find(a => a.id === w.activity_id)?.unit || ''}</b> on{' '}
                            {activities.find(a => a.id === w.activity_id)?.name || w.activity_id}
                            {w.rework_quantity ? ` · rework ${w.rework_quantity}` : ''}
                          </span>
                          <button type="button" onClick={() => handleRemoveWorkItem(i)} className="text-rose-600 font-bold text-xs hover:text-rose-800">
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Materials */}
          {(!isSimpleReporter || showMoreDetails) && (
            <div className="border-t border-slate-100 pt-4 space-y-3">
              <div className="font-bold text-slate-800 text-xs uppercase tracking-wider">Site Material Intake / Issues</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                <Field label="Material Name">
                  <input placeholder="e.g. Cement, Steel" value={form.material_name} onChange={e => setForm({ ...form, material_name: e.target.value })} />
                </Field>
                <Field label="Unit">
                  <input placeholder="Bag, Ton, m3" value={form.material_unit} onChange={e => setForm({ ...form, material_unit: e.target.value })} />
                </Field>
                <Field label="Received Qty">
                  <input type="number" min="0" value={form.received_qty || ''} onChange={e => setForm({ ...form, received_qty: Number(e.target.value) })} />
                </Field>
                <Field label="Consumed Qty">
                  <input type="number" min="0" value={form.consumed_qty || ''} onChange={e => setForm({ ...form, consumed_qty: Number(e.target.value) })} />
                </Field>
                <Field label="Vendor / Supplier">
                  <input placeholder="Vendor name" value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })} />
                </Field>
              </div>

              <div className="flex items-start gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleAddMaterial}
                  className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-xl transition"
                >
                  + Add Material Log
                </button>
                <div className="flex-1">
                  {materialItems.length > 0 && (
                    <ul className="space-y-1">
                      {materialItems.map((m, i) => (
                        <li key={i} className="flex justify-between items-center bg-slate-50 border border-slate-200 p-2 rounded-xl">
                          <span className="text-slate-800">
                            <b>{m.material_name}</b> (+{m.received_qty} / -{m.consumed_qty} {m.unit})
                          </span>
                          <button type="button" onClick={() => handleRemoveMaterial(i)} className="text-rose-600 font-bold text-xs hover:text-rose-800">
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Evidence Photos */}
          {canUpload && (
            <div className="border-t border-slate-100 pt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Verification Photos (Director Private Vault)">
                <input type="file" accept="image/*" multiple onChange={e => setFiles(Array.from(e.target.files || []))} />
              </Field>
              <Field label="Evidence Tag">
                <select value={evidenceType} onChange={e => setEvidenceType(e.target.value as SitePhoto['evidence_type'])}>
                  {['progress', 'quality', 'safety', 'delivery', 'attendance', 'other'].map(val => (
                    <option key={val} value={val}>{val}</option>
                  ))}
                </select>
              </Field>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
            {isSimpleReporter && (
              <button
                type="button"
                onClick={() => setShowMoreDetails(v => !v)}
                className="px-4 py-2 border border-slate-200 rounded-xl bg-slate-50 font-bold text-slate-700 hover:bg-slate-100 transition"
              >
                {showMoreDetails ? 'Hide Extra Fields' : t('daily.more')}
              </button>
            )}
            <button
              disabled={saving}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition shadow-xs disabled:opacity-50 ml-auto"
            >
              {saving ? t('common.saving') : isSimpleReporter ? t('daily.today') : t('common.submit')}
            </button>
          </div>
        </form>
      )}

      {/* Submissions List / Table */}
      {!isSimpleReporter ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-sm">Site Submissions History</h3>
            <span className="text-xs text-slate-500">{visibleReports.length} records</span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Date (BS)</th>
                  <th className="py-3 px-4">Resources</th>
                  <th className="py-3 px-4">Work Done</th>
                  <th className="py-3 px-4">Materials</th>
                  <th className="py-3 px-4">Instructions / Delays</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleReports.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      No daily site reports found for this filter.
                    </td>
                  </tr>
                ) : (
                  visibleReports.map(report => {
                    const work = storage.getDailyWorkItems(report.id);
                    const mats = storage.getDailyMaterialLogs(report.id);
                    return (
                      <tr key={report.id} className="hover:bg-blue-50/20 transition align-top">
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900 font-mono">{nepaliDate(report.report_date, language)}</div>
                          <div className="text-[11px] text-slate-500">{report.weather}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">By {report.submitted_by}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-slate-800 font-medium">{report.manpower_total} labour</div>
                          <div className="text-slate-500 text-[11px]">{report.equipment_total} plant hours</div>
                        </td>
                        <td className="py-3 px-4">
                          {work.length ? (
                            <div className="space-y-0.5">
                              {work.map((item: any, i: number) => (
                                <div key={i} className="text-slate-800">
                                  <b>{item.quantity_completed}</b> on {activities.find(a => a.id === item.activity_id)?.name || item.activity_id}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {mats.length ? (
                            <div className="space-y-0.5">
                              {mats.map((m: any, i: number) => (
                                <div key={i} className="text-slate-700">
                                  {m.material_name}: +{m.received_qty} / -{m.consumed_qty} {m.unit}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {report.site_instructions && (
                            <div className="text-slate-700"><b className="text-slate-900">Instr:</b> {report.site_instructions}</div>
                          )}
                          {report.obstruction_reasons && (
                            <div className="text-rose-700"><b className="text-rose-900">Delay:</b> {report.obstruction_reasons}</div>
                          )}
                          {!report.site_instructions && !report.obstruction_reasons && (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {canManageReport(report) && (
                              <button
                                onClick={() => startEditReport(report)}
                                className="px-2.5 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold rounded-lg transition"
                              >
                                Edit
                              </button>
                            )}
                            {canManageReport(report) && (
                              <button
                                onClick={() => handleDelete(report.id)}
                                className="px-2 py-1 text-slate-400 hover:text-rose-700 font-bold rounded-lg transition"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">{t('daily.mySubmissions')}</h3>
          {visibleReports.map(report => {
            const reportPhotos = visiblePhotos.filter(photo => photo.daily_report_id === report.id);
            const work = storage.getDailyWorkItems(report.id);
            const mats = storage.getDailyMaterialLogs(report.id);
            return (
              <article key={report.id} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 shadow-xs">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">{nepaliDate(report.report_date, language)} · {report.weather}</h3>
                    <div className="text-xs text-slate-500">Submitted by {report.submitted_by}</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => setSelectedReport({ ...report, work_items: work, material_items: mats })} className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs">
                      View details
                    </button>
                    {canManageReport(report) && (
                      <button onClick={() => startEditReport(report)} className="px-2.5 py-1 bg-blue-50 text-blue-700 font-bold rounded-lg text-xs">
                        Edit
                      </button>
                    )}
                    {canManageReport(report) && (
                      <button onClick={() => handleDelete(report.id)} className="px-2 py-1 text-slate-400 hover:text-rose-600 font-bold text-xs">
                        Delete
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid md:grid-cols-3 gap-2">
                  <Info label="Instructions" value={report.site_instructions} />
                  <Info label="Obstructions" value={report.obstruction_reasons} />
                  <Info label="Next Plan" value={report.next_day_plan} />
                </div>

                {work.length > 0 && (
                  <div className="text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <b className="text-slate-900">Work Items:</b>{' '}
                    {work.map((item: any) => `${item.quantity_completed} on ${activities.find(a => a.id === item.activity_id)?.name || item.activity_id}`).join(', ')}
                  </div>
                )}

                {canView && reportPhotos.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2">
                    {reportPhotos.map(photo => (
                      <figure key={photo.id}>
                        <img src={photo.url} alt={photo.caption || photo.name} className="h-28 w-full object-cover rounded-xl border border-slate-200" />
                        <figcaption className="text-[10px] text-slate-500 mt-1 truncate">{photo.caption || photo.name}</figcaption>
                      </figure>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      <RecordDetailsDialog title="Daily report" record={selectedReport} onClose={() => setSelectedReport(null)} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-slate-700 font-bold text-xs space-y-1 block">
      <span>{label}</span>
      <span className="block font-normal [&_input]:w-full [&_select]:w-full [&_textarea]:w-full [&_input]:bg-white [&_select]:bg-white [&_textarea]:bg-white [&_input]:border [&_select]:border [&_textarea]:border [&_input]:border-slate-300 [&_select]:border-slate-300 [&_textarea]:border-slate-300 [&_input]:p-2.5 [&_select]:p-2.5 [&_textarea]:p-2.5 [&_input]:rounded-xl [&_select]:rounded-xl [&_textarea]:rounded-xl [&_input]:text-slate-800 [&_select]:text-slate-800 [&_textarea]:text-slate-800 [&_input]:focus:border-blue-500 [&_select]:focus:border-blue-500 [&_textarea]:focus:border-blue-500">
        {children}
      </span>
    </label>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-xs">
      <div className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">{label}</div>
      <div className="mt-0.5 text-slate-800 font-medium">{value || 'None recorded'}</div>
    </div>
  );
}
