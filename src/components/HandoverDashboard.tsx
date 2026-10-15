import React, { useMemo, useState } from 'react';
import { HandoverItem, storage } from '../lib/storage';
import { formatBsDate, todayAdDate } from '../lib/nepaliDate';
import BsDatePicker from './BsDatePicker';
import UploadProgress from './UploadProgress';
import { useSubmissionLock } from '../lib/useSubmissionLock';

interface Props {
  handoverList: HandoverItem[];
  userRole: string;
  userName: string;
  onReload: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  as_built: 'As-Built Drawings',
  test_certificate: 'Test Certificate',
  operation_manual: 'O&M Manual',
  warranty: 'Warranty / Guarantee',
  training: 'Training & Handover',
  clearance: 'Statutory Clearance',
  taking_over: 'Taking-Over Certificate',
  other: 'General Deliverable',
};

const blankItem = () => ({
  item_name: '',
  category: 'as_built',
  responsible_party: '',
  due_date: todayAdDate(),
  remarks: '',
  completion_remarks: '',
  evidence_document_path: '',
  evidence_document_url: '',
});

export default function HandoverDashboard({ handoverList, userRole, userName, onReload }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blankItem);
  const [completing, setCompleting] = useState<HandoverItem | null>(null);
  const [completionDate, setCompletionDate] = useState(todayAdDate());
  const [completionRemarks, setCompletionRemarks] = useState('');
  const [evidence, setEvidence] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved'>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const { busy: uploading, run: runUpload } = useSubmissionLock();
  const canManage = ['project_director', 'project_manager', 'qa_qc_engineer'].includes(userRole);

  const stats = useMemo(() => {
    const total = handoverList.length;
    const approved = handoverList.filter(item => item.status === 'approved').length;
    const pending = total - approved;
    const progressPct = total ? Math.round((approved / total) * 100) : 0;
    const overdue = handoverList.filter(
      item => item.status !== 'approved' && item.due_date && item.due_date < todayAdDate()
    ).length;
    return { total, approved, pending, progressPct, overdue };
  }, [handoverList]);

  const filteredItems = useMemo(() => {
    return handoverList.filter(item => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        item.item_name.toLowerCase().includes(q) ||
        (item.responsible_party && item.responsible_party.toLowerCase().includes(q)) ||
        (item.remarks && item.remarks.toLowerCase().includes(q))
      );
    });
  }, [handoverList, statusFilter, categoryFilter, searchQuery]);

  const addItem = (event: React.FormEvent) => {
    event.preventDefault();
    storage.addHandoverItem(form);
    setForm(blankItem());
    setShowForm(false);
    setMessage('Handover deliverable added and assigned to the project register.');
    onReload();
  };

  const completeItem = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!completing || !evidence || !completionRemarks.trim()) {
      return setMessage('Completion remarks and signed evidence document are required.');
    }
    await runUpload(async () => {
      try {
        const uploaded = await storage.uploadProjectDocument(
          evidence,
          'report',
          completing.id,
          userName,
          `Handover: ${completing.item_name}`
        );
        storage.completeHandoverItem(completing.id, {
          approved_by: userName,
          approved_date: completionDate,
          completion_remarks: completionRemarks,
          evidence_document_path: uploaded.storage_path || '',
          evidence_document_url: uploaded.url || '',
        });
        setCompleting(null);
        setEvidence(null);
        setCompletionRemarks('');
        setMessage('Handover item approved and archived with signed evidence.');
        onReload();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Could not save the handover evidence.');
      }
    });
  };

  return (
    <div className="space-y-6">
      <UploadProgress active={uploading} label="Uploading and securing handover evidence…" />

      {/* 1. Header Command Banner */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 text-sm">🔑</span>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Project Completion & Taking-Over</span>
          </div>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">Handover &amp; Deliverables Checklist</h1>
          <p className="mt-1 text-xs md:text-sm text-slate-600 max-w-2xl leading-relaxed">
            Manage contractually required as-builts, testing certificates, warranties, and taking-over clearances with verifiable uploaded proof.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setShowForm(v => !v)}
            className="self-start md:self-auto px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center gap-1.5"
          >
            <span>{showForm ? '✕ Close Form' : '+ Add Deliverable'}</span>
          </button>
        )}
      </section>

      {/* 2. KPI Summary Cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Required Deliverables</span>
            <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center text-sm">📁</span>
          </div>
          <div className="mt-3">
            <div className="text-2xl md:text-3xl font-black text-slate-900">{stats.total}</div>
            <div className="text-[11px] text-slate-500 mt-1">Contract obligations</div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Approved &amp; Closed</span>
            <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center text-sm">✅</span>
          </div>
          <div className="mt-3">
            <div className="text-2xl md:text-3xl font-black text-emerald-600">{stats.approved}</div>
            <div className="text-[11px] text-slate-500 mt-1">Backed by signed proof</div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pending Completion</span>
            <span className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center text-sm">⏳</span>
          </div>
          <div className="mt-3">
            <div className="text-2xl md:text-3xl font-black text-amber-600">{stats.pending}</div>
            <div className="text-[11px] text-slate-500 mt-1">
              {stats.overdue > 0 ? `${stats.overdue} overdue items` : 'In preparation'}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Handover Readiness</span>
            <span className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-sm">📊</span>
          </div>
          <div className="mt-3">
            <div className="text-2xl md:text-3xl font-black text-indigo-600">{stats.progressPct}%</div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
              <div
                className="bg-indigo-600 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${stats.progressPct}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Message Banner */}
      {message && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/80 p-3.5 text-xs font-semibold text-blue-900 flex items-center justify-between">
          <span>{message}</span>
          <button onClick={() => setMessage('')} className="text-blue-600 hover:text-blue-800 text-xs font-bold">Dismiss</button>
        </div>
      )}

      {/* 3. Add Deliverable Form */}
      {showForm && canManage && (
        <form onSubmit={addItem} className="rounded-2xl border border-blue-200 bg-white p-5 md:p-6 shadow-md space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">Add Contract Handover Deliverable</h3>
              <p className="text-xs text-slate-500">Register required certificate, manual, or drawing package</p>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 uppercase">New Item</span>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Deliverable Name <span className="text-rose-500">*</span>
              </label>
              <input
                required
                value={form.item_name}
                onChange={e => setForm({ ...form, item_name: e.target.value })}
                placeholder="e.g., As-built structural drawings for culverts and retaining walls"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Category <span className="text-rose-500">*</span>
              </label>
              <select
                value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500"
              >
                {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Responsible Party / Team <span className="text-rose-500">*</span>
              </label>
              <input
                required
                value={form.responsible_party}
                onChange={e => setForm({ ...form, responsible_party: e.target.value })}
                placeholder="QA Team / MEP Subcontractor"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Due Date (BS) <span className="text-rose-500">*</span>
              </label>
              <BsDatePicker
                required
                value={form.due_date}
                onChange={due_date => setForm({ ...form, due_date })}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Requirements &amp; Notes <span className="text-rose-500">*</span>
              </label>
              <textarea
                required
                rows={1}
                value={form.remarks}
                onChange={e => setForm({ ...form, remarks: e.target.value })}
                placeholder="Submission format, signing requirements..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition shadow-xs"
            >
              ✓ Save Deliverable
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

      {/* 4. Filter Toolbar & Checklist Table */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          {/* Status Tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(['all', 'pending', 'approved'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition capitalize ${
                  statusFilter === tab
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab === 'all' ? 'All Deliverables' : tab === 'approved' ? 'Approved & Closed' : 'Pending'}
              </button>
            ))}
          </div>

          {/* Category Filter & Search */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-700 font-semibold focus:bg-white focus:outline-none"
            >
              <option value="all">All Categories</option>
              {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>

            <div className="relative">
              <span className="absolute left-2.5 top-2 text-xs text-slate-400">🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search deliverables..."
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
                <th className="py-2.5 px-3">Deliverable Item</th>
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3">Responsible Party</th>
                <th className="py-2.5 px-3">Due Date (BS)</th>
                <th className="py-2.5 px-3">Evidence Proof</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Approved (BS)</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <div className="text-2xl mb-1">📋</div>
                    No handover checklist items matching the current criteria.
                  </td>
                </tr>
              ) : (
                filteredItems.map(item => {
                  const isOverdue = item.status !== 'approved' && item.due_date && item.due_date < todayAdDate();
                  const isApproved = item.status === 'approved';
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3 font-semibold text-slate-900 max-w-[240px]">
                        <div className="truncate">{item.item_name}</div>
                        {item.remarks && (
                          <div className="text-[10px] text-slate-500 mt-0.5 truncate">{item.remarks}</div>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-700">
                          {CATEGORY_LABELS[item.category] || item.category}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-medium text-slate-800">
                        {item.responsible_party || 'Unassigned'}
                      </td>
                      <td className={`py-3 px-3 font-mono ${isOverdue ? 'font-bold text-rose-600' : ''}`}>
                        {formatBsDate(item.due_date)}
                        {isOverdue && <span className="block text-[9px] uppercase font-bold text-rose-500">Overdue</span>}
                      </td>
                      <td className="py-3 px-3">
                        {item.evidence_document_path || item.evidence_document_url ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                            <span>✓</span> Stored
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {isApproved ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Approved
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 uppercase">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px]">
                        {item.approved_date ? (
                          <div>
                            <div>{formatBsDate(item.approved_date)}</div>
                            <div className="text-[10px] text-slate-500">{item.approved_by || ''}</div>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {!isApproved && canManage ? (
                          <button
                            onClick={() => {
                              setCompleting(item);
                              setCompletionDate(todayAdDate());
                            }}
                            className="px-2.5 py-1 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition"
                          >
                            Complete →
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

      {/* 5. Complete Item Modal */}
      {completing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <form
            onSubmit={completeItem}
            className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-900 text-base">Complete Handover Deliverable</h3>
              <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                <span className="font-bold">Item:</span> {completing.item_name}
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Completion / Approval Date (BS) <span className="text-rose-500">*</span>
              </label>
              <BsDatePicker
                required
                value={completionDate}
                onChange={setCompletionDate}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Completion &amp; Handover Remarks <span className="text-rose-500">*</span>
              </label>
              <textarea
                required
                rows={3}
                value={completionRemarks}
                onChange={e => setCompletionRemarks(e.target.value)}
                placeholder="State client approval status, signed taking-over notes, or warranty references..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Signed Deliverable Evidence File <span className="text-rose-500">*</span>
              </label>
              <input
                required
                type="file"
                accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx"
                onChange={e => setEvidence(e.target.files?.[0] || null)}
                className="w-full text-xs text-slate-600 file:mr-2 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                disabled={uploading}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition shadow-xs disabled:opacity-50"
              >
                {uploading ? 'Saving Evidence…' : '✓ Approve & Complete Deliverable'}
              </button>
              <button
                type="button"
                onClick={() => setCompleting(null)}
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
