'use client';

import { useEffect, useMemo, useState } from 'react';
import BsDatePicker from './BsDatePicker';
import { storage } from '../lib/storage';
import RecordDetailsDialog from './RecordDetailsDialog';

type RecordType = 'variation' | 'claim_cost' | 'claim_eot';
const today = () => new Date().toISOString().slice(0, 10);
const labels: Record<RecordType, string> = {
  variation: 'Variation Order',
  claim_cost: 'Cost Claim',
  claim_eot: 'Extension of Time (EOT)',
};

export default function CommercialControlWorkspace({
  projectId,
  role,
}: {
  projectId: string;
  role: string;
}) {
  const [data, setData] = useState<any>({ records: [], history: [], activities: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'all' | RecordType>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);

  const [form, setForm] = useState({
    type: 'variation' as RecordType,
    referenceId: '',
    title: '',
    description: '',
    reasonBasis: '',
    affectedActivityId: '',
    requestedDays: '',
    requestedCompletionDate: '',
    costImpact: '',
    proposedQuantity: '',
    proposedRate: '',
    eventDate: today(),
    noticeDate: today(),
  });

  const canCreate = ['project_director', 'project_manager', 'qs_billing_engineer'].includes(role);
  const director = role === 'project_director';

  const headers = async () => ({
    Authorization: `Bearer ${(await storage.getAuthSession())?.access_token || ''}`,
    'Content-Type': 'application/json',
  });

  const load = async () => {
    const response = await fetch(`/api/commercial?projectId=${encodeURIComponent(projectId)}`, {
      headers: await headers(),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) setError(payload.error || 'Commercial records are unavailable.');
    else setData(payload);
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [projectId]);

  const command = async (body: any, method = 'POST') => {
    setBusy(true);
    setError('');
    setNotice('');
    const response = await fetch('/api/commercial', {
      method,
      headers: await headers(),
      body: JSON.stringify({ projectId, ...body }),
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(payload.error || 'Commercial action failed.');
    } else {
      setNotice('Saved successfully.');
      void load();
    }
  };

  const records = useMemo(() => data.records || [], [data.records]);
  const history = (id: string) => (data.history || []).filter((item: any) => item.commercial_record_id === id);

  const stats = useMemo(() => {
    const total = records.length;
    const totalCostImpact = records.reduce((sum: number, r: any) => sum + Number(r.cost_impact_amount || 0), 0);
    const totalDays = records.reduce((sum: number, r: any) => sum + Number(r.time_impact_days || 0), 0);
    const pendingReview = records.filter((r: any) => r.workflow_status === 'submitted' || r.workflow_status === 'under_review').length;
    const approvedCount = records.filter((r: any) => r.workflow_status === 'approved').length;
    return { total, totalCostImpact, totalDays, pendingReview, approvedCount };
  }, [records]);

  const filteredRecords = useMemo(() => {
    return records.filter((r: any) => {
      if (typeFilter !== 'all' && r.type !== typeFilter) return false;
      if (statusFilter !== 'all' && r.workflow_status !== statusFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        r.reference_id?.toLowerCase().includes(q) ||
        r.title?.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q) ||
        r.reason_basis?.toLowerCase().includes(q)
      );
    });
  }, [records, typeFilter, statusFilter, searchQuery]);

  return (
    <section className="space-y-6">
      {/* 1. Command Header */}
      <header className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 text-sm">⚖️</span>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Commercial Controls &amp; Claims</span>
          </div>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">Variations &amp; Extension of Time</h1>
          <p className="mt-1 text-xs md:text-sm text-slate-600 max-w-2xl leading-relaxed">
            Manage contract variations, contractor claims, and time extensions with full audit logs and immutable transitions.
          </p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => setShowCreate(!showCreate)}
            className="self-start md:self-auto px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center gap-1.5"
          >
            <span>{showCreate ? '✕ Close Form' : '+ Register Commercial Draft'}</span>
          </button>
        )}
      </header>

      {/* 2. 4 Colorful KPI Summary Cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Claims</span>
            <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center text-sm">📋</span>
          </div>
          <div className="mt-3">
            <div className="text-2xl md:text-3xl font-black text-slate-900">{stats.total}</div>
            <div className="text-[11px] text-slate-500 mt-1">{stats.approvedCount} approved records</div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Cost Impact</span>
            <span className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center text-sm">💰</span>
          </div>
          <div className="mt-3">
            <div className="text-2xl md:text-3xl font-black text-amber-600">
              NPR {(stats.totalCostImpact / 1_000_000).toFixed(2)}m
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Claimed &amp; proposed value</div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">EOT Time Impact</span>
            <span className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-sm">⏳</span>
          </div>
          <div className="mt-3">
            <div className="text-2xl md:text-3xl font-black text-indigo-600">{stats.totalDays} Days</div>
            <div className="text-[11px] text-slate-500 mt-1">Requested completion extension</div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pending Action</span>
            <span className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center text-sm">⚠️</span>
          </div>
          <div className="mt-3">
            <div className={`text-2xl md:text-3xl font-black ${stats.pendingReview > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
              {stats.pendingReview}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Submitted or in review</div>
          </div>
        </div>
      </section>

      {/* Alerts */}
      {error && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50/80 p-3.5 text-xs font-semibold text-rose-900 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-rose-600 font-bold">Dismiss</button>
        </p>
      )}
      {notice && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3.5 text-xs font-semibold text-emerald-900 flex items-center justify-between">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="text-emerald-600 font-bold">Dismiss</button>
        </p>
      )}

      {/* 3. Register Commercial Draft Form */}
      {canCreate && showCreate && (
        <form
          onSubmit={event => {
            event.preventDefault();
            void command(editingRecordId ? { action: 'update', recordId: editingRecordId, ...form } : { action: 'create', ...form });
            setEditingRecordId(null);
            setForm({
              ...form,
              referenceId: '',
              title: '',
              description: '',
              reasonBasis: '',
              requestedDays: '',
              requestedCompletionDate: '',
              costImpact: '',
              proposedQuantity: '',
              proposedRate: '',
            });
            setShowCreate(false);
          }}
          className="rounded-2xl border border-blue-200 bg-white p-5 md:p-6 shadow-md space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">Register Commercial Action / Claim</h3>
              <p className="text-xs text-slate-500">Record formal variation request, cost escalation, or extension of time</p>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 uppercase">Draft</span>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Record Type <span className="text-rose-500">*</span>
              </label>
              <select
                value={form.type}
                onChange={event => setForm({ ...form, type: event.target.value as RecordType })}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500"
              >
                {Object.entries(labels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Reference ID <span className="text-rose-500">*</span>
              </label>
              <input
                required
                value={form.referenceId}
                onChange={event => setForm({ ...form, referenceId: event.target.value })}
                placeholder="e.g. VAR-001 or CLM-102"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Title / Scope <span className="text-rose-500">*</span>
              </label>
              <input
                required
                value={form.title}
                onChange={event => setForm({ ...form, title: event.target.value })}
                placeholder="e.g., Additional foundation piling due to high water table"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Affected BOQ Item
              </label>
              <select
                value={form.affectedActivityId}
                onChange={event => setForm({ ...form, affectedActivityId: event.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500"
              >
                <option value="">(Optional) General / No BOQ link</option>
                {(data.activities || []).map((item: any) => (
                  <option key={item.id} value={item.id}>
                    {item.wbs_code} · {item.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Proposed Quantity
              </label>
              <input
                type="number"
                min="0"
                value={form.proposedQuantity}
                onChange={event => setForm({ ...form, proposedQuantity: event.target.value })}
                placeholder="Quantity"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Proposed Unit Rate (NPR)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.proposedRate}
                onChange={event => setForm({ ...form, proposedRate: event.target.value })}
                placeholder="Rate"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Total Cost Impact (NPR)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.costImpact}
                onChange={event => setForm({ ...form, costImpact: event.target.value })}
                placeholder="Total impact in NPR"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Extension Days Requested
              </label>
              <input
                type="number"
                min="0"
                value={form.requestedDays}
                onChange={event => setForm({ ...form, requestedDays: event.target.value })}
                placeholder="e.g. 14 days"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Target Completion Date (BS)
              </label>
              <BsDatePicker
                value={form.requestedCompletionDate}
                onChange={value => setForm({ ...form, requestedCompletionDate: value })}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Event / Obstacle Date (BS)
              </label>
              <BsDatePicker
                value={form.eventDate}
                onChange={value => setForm({ ...form, eventDate: value })}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Notice Submission Date (BS)
              </label>
              <BsDatePicker
                value={form.noticeDate}
                onChange={value => setForm({ ...form, noticeDate: value })}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Contractual Basis / Justification
              </label>
              <textarea
                value={form.reasonBasis}
                onChange={event => setForm({ ...form, reasonBasis: event.target.value })}
                placeholder="e.g. Clause 8.4 Employer delay in drawing issue / unforeseen geological event..."
                rows={2}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Detailed Scope &amp; Remarks
              </label>
              <textarea
                value={form.description}
                onChange={event => setForm({ ...form, description: event.target.value })}
                placeholder="Detailed scope, impact on critical path activities, mitigation notes..."
                rows={2}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              disabled={busy}
              type="submit"
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition shadow-xs disabled:opacity-50"
            >
              {busy ? 'Saving…' : '✓ Save Commercial Draft'}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* 4. Filter Toolbar & Commercial Records List */}
      <section className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Type Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setTypeFilter('all')}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition ${
                typeFilter === 'all'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Types
            </button>
            {(['variation', 'claim_cost', 'claim_eot'] as const).map(type => (
              <button
                key={type}
                onClick={() => setTypeFilter(type)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition ${
                  typeFilter === type
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {labels[type]}
              </button>
            ))}
          </div>

          {/* Status Dropdown & Search */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-700 font-semibold focus:bg-white focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="under_review">Under Review</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>

            <div className="relative">
              <span className="absolute left-2.5 top-2 text-xs text-slate-400">🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search reference, title..."
                className="pl-7 pr-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500 w-full sm:w-52"
              />
            </div>
          </div>
        </div>

        {/* Records */}
        <div className="space-y-3.5">
          {filteredRecords.map((record: any) => {
            const status = record.workflow_status || 'draft';
            return (
              <article
                key={record.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:border-slate-300 transition-all"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                        {record.reference_id}
                      </span>
                      <h3 className="font-bold text-slate-900 text-sm">{record.title}</h3>
                    </div>
                    <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-blue-700">{labels[record.type as RecordType]}</span>
                      <span>·</span>
                      <CommercialStatusBadge value={status} />
                      {record.affected_activity_id && (
                        <>
                          <span>·</span>
                          <span className="text-slate-600 bg-slate-100 px-2 py-0.2 rounded text-[11px] font-medium">
                            BOQ Linked
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedRecord({ ...record, action_history: history(record.id) })}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
                    >
                      View details
                    </button>
                    {record.workflow_status === 'draft' && canCreate && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingRecordId(record.id);
                          setShowCreate(true);
                          setForm({
                            type: record.type,
                            referenceId: record.reference_id,
                            title: record.title,
                            description: record.description || '',
                            reasonBasis: record.reason_basis || '',
                            affectedActivityId: record.affected_activity_id || '',
                            requestedDays: String(record.time_impact_days || ''),
                            requestedCompletionDate: record.requested_completion_date || '',
                            costImpact: String(record.cost_impact_amount || ''),
                            proposedQuantity: String(record.proposed_quantity || ''),
                            proposedRate: String(record.proposed_rate || ''),
                            eventDate: record.event_date || today(),
                            noticeDate: record.notice_date || today(),
                          });
                        }}
                        className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-xs font-bold rounded-xl transition"
                      >
                        Edit details
                      </button>
                    )}
                    {status === 'draft' && (
                      <button
                        disabled={busy}
                        onClick={() => void command({ recordId: record.id, action: 'submitted' }, 'PATCH')}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition shadow-xs"
                      >
                        Submit for Review →
                      </button>
                    )}
                    {status === 'submitted' && director && (
                      <button
                        disabled={busy}
                        onClick={() => void command({ recordId: record.id, action: 'under_review' }, 'PATCH')}
                        className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-bold rounded-xl transition"
                      >
                        Begin Review →
                      </button>
                    )}
                    {status === 'under_review' && director && (
                      <>
                        <button
                          disabled={busy}
                          onClick={() =>
                            void command(
                              {
                                recordId: record.id,
                                action: 'approved',
                                approvedExtensionDays: record.time_impact_days,
                              },
                              'PATCH'
                            )
                          }
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition shadow-xs"
                        >
                          Approve
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => void command({ recordId: record.id, action: 'rejected' }, 'PATCH')}
                          className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold rounded-xl transition"
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-3 bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/80">
                  <div>
                    <dt className="text-slate-500 font-bold uppercase text-[10px] tracking-wider">Value Impact</dt>
                    <dd className="font-bold text-slate-900 mt-0.5 text-sm font-mono">
                      NPR {Number(record.cost_impact_amount || 0).toLocaleString()}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 font-bold uppercase text-[10px] tracking-wider">EOT Requested / Approved</dt>
                    <dd className="font-bold text-slate-900 mt-0.5 text-sm font-mono">
                      {record.time_impact_days || 0} / {record.approved_extension_days ?? '—'} days
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 font-bold uppercase text-[10px] tracking-wider">Completion Target</dt>
                    <dd className="font-bold text-slate-900 mt-0.5 text-sm font-mono">
                      {record.approved_completion_date || record.requested_completion_date || '—'}
                    </dd>
                  </div>
                </dl>

                {record.description && (
                  <p className="mt-3 text-xs text-slate-600 leading-relaxed">
                    {record.description}
                  </p>
                )}

                {history(record.id).length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                    <span className="font-bold text-slate-400">Audit Trail:</span>
                    {history(record.id).map((item: any) => (
                      <span key={item.id} className="rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-slate-700 font-medium text-[10px]">
                        {item.action} · {String(item.created_at).slice(0, 10)}
                      </span>
                    ))}
                  </div>
                )}
              </article>
            );
          })}

          {filteredRecords.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 p-12 text-center text-xs text-slate-500 bg-white">
              <div className="text-2xl mb-1">⚖️</div>
              No controlled commercial records found matching the criteria.
            </div>
          )}
        </div>
      </section>
      <RecordDetailsDialog title="Commercial record" record={selectedRecord} onClose={() => setSelectedRecord(null)} />
    </section>
  );
}

function CommercialStatusBadge({ value }: { value: string }) {
  const styles: Record<string, string> = {
    approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    rejected: 'bg-rose-50 text-rose-700 border-rose-200',
    under_review: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    submitted: 'bg-amber-50 text-amber-700 border-amber-200',
    draft: 'bg-slate-100 text-slate-600 border-slate-200',
  };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase ${styles[value] || styles.draft}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {value.replaceAll('_', ' ')}
    </span>
  );
}
