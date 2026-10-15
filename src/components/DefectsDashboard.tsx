import React, { useMemo, useState } from 'react';
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
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'rectified' | 'verified'>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [form, setForm] = useState({
    defect_description: '',
    reported_date: todayAdDate(),
    responsible_team: '',
    rectification_deadline: todayAdDate(),
    location: '',
    severity: 'medium' as DefectEntry['severity'],
    activity_id: '',
    status: 'pending' as const,
  });

  const { busy: uploading, run: runUpload } = useSubmissionLock();
  const canReport = ['project_director', 'project_manager', 'qa_qc_engineer', 'site_engineer'].includes(userRole);
  const canVerify = ['project_director', 'project_manager', 'qa_qc_engineer'].includes(userRole);

  const stats = useMemo(() => {
    const total = defectsList.length;
    const pending = defectsList.filter(d => d.status === 'pending').length;
    const rectified = defectsList.filter(d => d.status === 'rectified').length;
    const verified = defectsList.filter(d => d.status === 'verified').length;
    const criticalOverdue = defectsList.filter(d => d.status !== 'verified' && d.rectification_deadline < todayAdDate()).length;
    return { total, pending, rectified, verified, criticalOverdue };
  }, [defectsList]);

  const filteredDefects = useMemo(() => {
    return defectsList.filter(d => {
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      if (severityFilter !== 'all' && d.severity !== severityFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const act = activities.find(a => a.id === d.activity_id);
      return (
        d.defect_description.toLowerCase().includes(q) ||
        (d.location && d.location.toLowerCase().includes(q)) ||
        d.responsible_team.toLowerCase().includes(q) ||
        (act && (act.name.toLowerCase().includes(q) || act.wbs_code.toLowerCase().includes(q)))
      );
    });
  }, [defectsList, statusFilter, severityFilter, searchQuery, activities]);

  const reportDefect = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!sourceFile) return setMessage('Upload a photo, inspection note or defect report before registering the defect.');
    await runUpload(async () => {
      try {
        const id = `def-${Date.now()}`;
        const uploaded = await storage.uploadProjectDocument(
          sourceFile,
          'test_report',
          id,
          userName,
          `Defect: ${form.defect_description}`
        );
        storage.addDefect({
          ...form,
          id,
          reported_document_path: uploaded.storage_path || '',
          reported_document_url: uploaded.url || '',
        });
        setForm({
          defect_description: '',
          reported_date: todayAdDate(),
          responsible_team: '',
          rectification_deadline: todayAdDate(),
          location: '',
          severity: 'medium',
          activity_id: '',
          status: 'pending',
        });
        setSourceFile(null);
        setShowForm(false);
        setMessage('Defect recorded and assigned with photographic evidence.');
        onReload();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Could not register the defect.');
      }
    });
  };

  const closeDefect = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!closing || !closureRemarks.trim()) return setMessage('Closure or verification remarks are required.');
    const nextStatus = closing.status === 'pending' ? 'rectified' : 'verified';
    if (nextStatus === 'rectified' && !closureFile) {
      return setMessage('Upload rectification evidence before marking the defect rectified.');
    }
    await runUpload(async () => {
      try {
        let path = closing.closure_document_path || '';
        let url = closing.closure_document_url || '';
        if (closureFile) {
          const uploaded = await storage.uploadProjectDocument(
            closureFile,
            'test_report',
            closing.id,
            userName,
            `Defect ${nextStatus}: ${closing.defect_description}`
          );
          path = uploaded.storage_path || '';
          url = uploaded.url || '';
        }
        storage.updateDefectStatus(closing.id, nextStatus, {
          closure_document_path: path,
          closure_document_url: url,
          closure_remarks: closureRemarks,
          ...(nextStatus === 'verified' ? { verified_by: userName, verified_date: todayAdDate() } : {}),
        });
        setClosing(null);
        setClosureFile(null);
        setClosureRemarks('');
        setMessage(
          nextStatus === 'rectified'
            ? 'Rectification evidence recorded; awaiting QA/Director verification.'
            : 'Defect closure verified successfully.'
        );
        onReload();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Could not update the defect.');
      }
    });
  };

  return (
    <div className="space-y-6">
      <UploadProgress active={uploading} label="Uploading and securing defect evidence…" />

      {/* 1. Header Banner */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600 text-sm">🔧</span>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Site Quality & Compliance</span>
          </div>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">Defects & Rectification Register</h1>
          <p className="mt-1 text-xs md:text-sm text-slate-600 max-w-2xl leading-relaxed">
            Record snagging items, non-conformances, and site defects with photo evidence. Track rectification workflows and QA closure sign-off.
          </p>
        </div>
        {canReport && (
          <button
            type="button"
            onClick={() => setShowForm(v => !v)}
            className="self-start md:self-auto px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center gap-1.5"
          >
            <span>{showForm ? '✕ Close Form' : '+ Report Defect'}</span>
          </button>
        )}
      </section>

      {/* 2. KPI Summary Cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Defects</span>
            <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center text-sm">📋</span>
          </div>
          <div className="mt-3">
            <div className="text-2xl md:text-3xl font-black text-slate-900">{stats.total}</div>
            <div className="text-[11px] text-slate-500 mt-1">Logged across all blocks</div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pending Action</span>
            <span className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center text-sm">⏳</span>
          </div>
          <div className="mt-3">
            <div className="text-2xl md:text-3xl font-black text-amber-600">{stats.pending}</div>
            <div className="text-[11px] text-slate-500 mt-1">Awaiting rectification</div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Rectified</span>
            <span className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-sm">🛠️</span>
          </div>
          <div className="mt-3">
            <div className="text-2xl md:text-3xl font-black text-indigo-600">{stats.rectified}</div>
            <div className="text-[11px] text-slate-500 mt-1">Ready for QA verification</div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Verified Closed</span>
            <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center text-sm">✅</span>
          </div>
          <div className="mt-3">
            <div className="text-2xl md:text-3xl font-black text-emerald-600">{stats.verified}</div>
            <div className="text-[11px] text-slate-500 mt-1">Closure signed off</div>
          </div>
        </div>
      </section>

      {/* Flash Message */}
      {message && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/80 p-3.5 text-xs font-semibold text-blue-900 flex items-center justify-between">
          <span>{message}</span>
          <button onClick={() => setMessage('')} className="text-blue-600 hover:text-blue-800 text-xs font-bold">Dismiss</button>
        </div>
      )}

      {/* 3. Register Defect Form */}
      {showForm && canReport && (
        <form onSubmit={reportDefect} className="rounded-2xl border border-blue-200 bg-white p-5 md:p-6 shadow-md space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">Register New Defect or Snag</h3>
              <p className="text-xs text-slate-500">Provide exact site location and mandatory photographic evidence</p>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 uppercase">New Entry</span>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Defect Description <span className="text-rose-500">*</span>
              </label>
              <textarea
                required
                rows={2}
                value={form.defect_description}
                onChange={e => setForm({ ...form, defect_description: e.target.value })}
                placeholder="Describe the issue, material crack, concrete honeycomb, or workmanship defect..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Site Location <span className="text-rose-500">*</span>
              </label>
              <input
                required
                value={form.location}
                onChange={e => setForm({ ...form, location: e.target.value })}
                placeholder="Block B, 3rd Floor / Ch 14+250"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Linked BOQ Work Item
              </label>
              <select
                value={form.activity_id}
                onChange={e => setForm({ ...form, activity_id: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500"
              >
                <option value="">General / No BOQ Link</option>
                {activities.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.wbs_code} — {item.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Responsible Team / Subcontractor <span className="text-rose-500">*</span>
              </label>
              <input
                required
                value={form.responsible_team}
                onChange={e => setForm({ ...form, responsible_team: e.target.value })}
                placeholder="e.g., Shuttering Crew A / Subcontractor X"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Severity Level <span className="text-rose-500">*</span>
              </label>
              <select
                value={form.severity}
                onChange={e => setForm({ ...form, severity: e.target.value as DefectEntry['severity'] })}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500"
              >
                <option value="low">Low (Cosmetic, minor paint/surface)</option>
                <option value="medium">Medium (Requires rework before finish)</option>
                <option value="high">High (Structural or safety impact)</option>
                <option value="critical">Critical (Immediate work stoppage)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Reported Date (BS) <span className="text-rose-500">*</span>
              </label>
              <BsDatePicker
                required
                value={form.reported_date}
                onChange={reported_date => setForm({ ...form, reported_date })}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Rectification Deadline (BS) <span className="text-rose-500">*</span>
              </label>
              <BsDatePicker
                required
                value={form.rectification_deadline}
                onChange={rectification_deadline => setForm({ ...form, rectification_deadline })}
                min={form.reported_date}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Photo Evidence / Report <span className="text-rose-500">*</span>
              </label>
              <input
                required
                type="file"
                accept="application/pdf,image/*,.doc,.docx"
                onChange={e => setSourceFile(e.target.files?.[0] || null)}
                className="w-full text-xs text-slate-600 file:mr-2 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              disabled={uploading}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition shadow-xs disabled:opacity-50"
            >
              {uploading ? 'Uploading Evidence…' : '✓ Save & Assign Defect'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* 4. Filter Toolbar & Data Table */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          {/* Status Tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(['all', 'pending', 'rectified', 'verified'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition capitalize ${
                  statusFilter === tab
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab === 'all' ? 'All Defects' : tab}
              </button>
            ))}
          </div>

          {/* Search & Severity Filter */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={severityFilter}
              onChange={e => setSeverityFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-700 font-semibold focus:bg-white focus:outline-none"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>

            <div className="relative">
              <span className="absolute left-2.5 top-2 text-xs text-slate-400">🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search defects..."
                className="pl-7 pr-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500 w-44 sm:w-56"
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[950px] border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-500 font-bold uppercase text-[10px] tracking-wider text-left">
                <th className="py-2.5 px-3">Defect &amp; Description</th>
                <th className="py-2.5 px-3">Location / BOQ</th>
                <th className="py-2.5 px-3">Assigned Team</th>
                <th className="py-2.5 px-3">Reported (BS)</th>
                <th className="py-2.5 px-3">Deadline (BS)</th>
                <th className="py-2.5 px-3">Severity</th>
                <th className="py-2.5 px-3">Evidence</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredDefects.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <div className="text-2xl mb-1">✨</div>
                    No defects matching the selected criteria.
                  </td>
                </tr>
              ) : (
                filteredDefects.map(item => {
                  const isOverdue = item.status !== 'verified' && item.rectification_deadline < todayAdDate();
                  const act = activities.find(a => a.id === item.activity_id);
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3 font-semibold text-slate-900 max-w-[220px]">
                        <div className="truncate">{item.defect_description}</div>
                        {item.closure_remarks && (
                          <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                            Note: {item.closure_remarks}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-medium text-slate-800">{item.location || '—'}</div>
                        <div className="text-[10px] text-slate-500">{act?.wbs_code || 'General'}</div>
                      </td>
                      <td className="py-3 px-3 font-medium text-slate-800">{item.responsible_team}</td>
                      <td className="py-3 px-3 font-mono">{formatBsDate(item.reported_date)}</td>
                      <td className={`py-3 px-3 font-mono ${isOverdue ? 'font-bold text-rose-600' : ''}`}>
                        {formatBsDate(item.rectification_deadline)}
                        {isOverdue && <span className="block text-[9px] uppercase font-bold text-rose-500">Overdue</span>}
                      </td>
                      <td className="py-3 px-3">
                        <SeverityBadge value={item.severity || 'medium'} />
                      </td>
                      <td className="py-3 px-3">
                        <div className="space-y-0.5 text-[10px]">
                          <span className={`inline-block px-1.5 py-0.2 rounded font-bold ${item.reported_document_path || item.reported_document_url ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                            Source {item.reported_document_path || item.reported_document_url ? '✓' : '✗'}
                          </span>
                          {item.closure_document_path || item.closure_document_url ? (
                            <span className="block px-1.5 py-0.2 rounded font-bold bg-indigo-50 text-indigo-700">
                              Rectified ✓
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <StatusBadge value={item.status} />
                      </td>
                      <td className="py-3 px-3 text-right">
                        {item.status === 'pending' && canReport ? (
                          <button
                            onClick={() => setClosing(item)}
                            className="px-2.5 py-1 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition"
                          >
                            Rectify →
                          </button>
                        ) : item.status === 'rectified' && canVerify ? (
                          <button
                            onClick={() => setClosing(item)}
                            className="px-2.5 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition"
                          >
                            Verify →
                          </button>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 5. Modal: Rectification / Closure Verification */}
      {closing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <form
            onSubmit={closeDefect}
            className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-900 text-base">
                {closing.status === 'pending' ? 'Submit Rectification Evidence' : 'Verify Defect Closure'}
              </h3>
              <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                <span className="font-bold">Defect:</span> {closing.defect_description}
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                {closing.status === 'pending' ? 'Rectification Remarks' : 'Verification Remarks'}{' '}
                <span className="text-rose-500">*</span>
              </label>
              <textarea
                required
                rows={3}
                value={closureRemarks}
                onChange={e => setClosureRemarks(e.target.value)}
                placeholder="State actions taken to rectify, materials used, inspection results..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                {closing.status === 'pending' ? 'Rectification Photo/Document Evidence' : 'Additional Verification Evidence (optional)'}{' '}
                {closing.status === 'pending' && <span className="text-rose-500">*</span>}
              </label>
              <input
                required={closing.status === 'pending'}
                type="file"
                accept="application/pdf,image/*,.doc,.docx"
                onChange={e => setClosureFile(e.target.files?.[0] || null)}
                className="w-full text-xs text-slate-600 file:mr-2 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                disabled={uploading}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition shadow-xs disabled:opacity-50"
              >
                {uploading
                  ? 'Saving…'
                  : closing.status === 'pending'
                  ? 'Submit Rectification'
                  : 'Verify & Close Defect'}
              </button>
              <button
                type="button"
                onClick={() => setClosing(null)}
                className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ value }: { value: string }) {
  if (value === 'verified') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        Verified
      </span>
    );
  }
  if (value === 'rectified') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase">
        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
        Rectified
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 uppercase">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
      Pending
    </span>
  );
}

function SeverityBadge({ value }: { value: string }) {
  const styles: Record<string, string> = {
    critical: 'bg-rose-50 text-rose-700 border-rose-200',
    high: 'bg-orange-50 text-orange-700 border-orange-200',
    medium: 'bg-amber-50 text-amber-700 border-amber-200',
    low: 'bg-slate-100 text-slate-600 border-slate-200',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${styles[value] || styles.medium}`}>
      {value}
    </span>
  );
}
