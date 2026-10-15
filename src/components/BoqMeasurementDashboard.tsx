'use client';

import { useEffect, useMemo, useState } from 'react';
import { storage } from '../lib/storage';
import BsDatePicker from './BsDatePicker';

export default function BoqMeasurementDashboard({
  projectId,
  canReview
}: {
  projectId: string;
  canReview: boolean;
}) {
  const [activities, setActivities] = useState<any[]>([]);
  const [measurements, setMeasurements] = useState<any[]>([]);
  const [summary, setSummary] = useState<Record<string, any>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    activityId: '',
    measurementDate: '',
    quantity: '',
    description: ''
  });

  const getHeaders = async () => ({
    Authorization: `Bearer ${(await storage.getAuthSession())?.access_token || ''}`,
    'Content-Type': 'application/json'
  });

  const load = async () => {
    const res = await fetch(`/api/boq/measurements?projectId=${encodeURIComponent(projectId)}`, {
      headers: await getHeaders()
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || 'Measurements are unavailable.');
      return;
    }
    setActivities(data.activities || []);
    setMeasurements(data.measurements || []);
    setSummary(data.summary || {});
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [projectId]);

  const selectedActivity = useMemo(
    () => activities.find(a => a.id === form.activityId),
    [activities, form.activityId]
  );

  const send = async (body: any, method = 'POST') => {
    setBusy(true);
    setError('');
    const res = await fetch('/api/boq/measurements', {
      method,
      headers: await getHeaders(),
      body: JSON.stringify({ projectId, ...body })
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || 'Measurement action failed.');
    } else {
      void load();
    }
  };

  return (
    <section className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 text-sm">📐</span>
            <h2 className="text-base font-bold text-slate-900">BOQ Measurement Sheet Register</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Executed physical quantities are verified independently from daily reporting and become valuation inputs only upon approval.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-semibold text-white shadow-xs transition"
        >
          {showForm ? '✕ Cancel' : '+ Record Measurement'}
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-semibold text-rose-900">
          {error}
        </p>
      )}

      {/* Entry Form */}
      {showForm && (
        <form
          onSubmit={e => {
            e.preventDefault();
            void send({
              activityId: form.activityId,
              measurementDate: form.measurementDate,
              quantity: Number(form.quantity),
              description: form.description
            });
            setForm({ activityId: '', measurementDate: '', quantity: '', description: '' });
            setShowForm(false);
          }}
          className="rounded-2xl border border-blue-200 bg-white p-5 shadow-xs space-y-4"
        >
          <div>
            <h3 className="text-sm font-bold text-slate-900">Record Field Measurement</h3>
            <p className="text-xs text-slate-500">Submit quantity measured on-site with chainage or level remarks for QS verification.</p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs font-semibold text-slate-700 space-y-1 block">
              <span>BOQ Work Item</span>
              <select
                required
                value={form.activityId}
                onChange={e => setForm({ ...form, activityId: e.target.value })}
                className="w-full rounded-xl border border-slate-300 bg-white p-2 text-xs text-slate-900 outline-none focus:border-blue-600"
              >
                <option value="">Select BOQ item...</option>
                {activities.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.wbs_code} · {a.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-semibold text-slate-700 space-y-1 block">
              <span>Measured Quantity</span>
              <input
                required
                min="0"
                step="0.001"
                type="number"
                value={form.quantity}
                onChange={e => setForm({ ...form, quantity: e.target.value })}
                placeholder="0.00"
                className="w-full rounded-xl border border-slate-300 bg-white p-2 text-xs text-slate-900 outline-none focus:border-blue-600"
              />
            </label>

            <label className="text-xs font-semibold text-slate-700 space-y-1 block">
              <span>Measurement Date (BS)</span>
              <BsDatePicker
                value={form.measurementDate}
                onChange={v => setForm({ ...form, measurementDate: v })}
              />
            </label>

            <label className="text-xs font-semibold text-slate-700 space-y-1 block">
              <span>Chainage / Reference / Remarks</span>
              <input
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="e.g. Ch 12+240 to 12+350 LHS"
                className="w-full rounded-xl border border-slate-300 bg-white p-2 text-xs text-slate-900 outline-none focus:border-blue-600"
              />
            </label>
          </div>

          {selectedActivity && (
            <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600 flex flex-wrap gap-4 border border-slate-200/80">
              <span><b>Total Scope:</b> {selectedActivity.planned_quantity} {selectedActivity.unit}</span>
              <span><b>Approved So Far:</b> {summary[selectedActivity.id]?.cumulativeApprovedQuantity || 0} {selectedActivity.unit}</span>
              <span><b>Remaining:</b> {summary[selectedActivity.id]?.remainingQuantity ?? selectedActivity.planned_quantity} {selectedActivity.unit}</span>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              disabled={busy}
              type="submit"
              className="rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-bold text-white shadow-xs transition disabled:opacity-60"
            >
              {busy ? 'Saving…' : 'Save Draft Measurement'}
            </button>
          </div>
        </form>
      )}

      {/* Measurement Table */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">Measurement Submissions</h3>
            <p className="text-xs text-slate-500">Record sheets awaiting engineer review and certified measurements.</p>
          </div>
          <span className="text-xs font-semibold text-slate-500">
            {measurements.length} records
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-slate-600 font-semibold">
                <th className="py-2.5 px-3">BOQ Item</th>
                <th className="py-2.5 px-3 text-right">Quantity</th>
                <th className="py-2.5 px-3">Date (BS)</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {measurements.map(m => {
                let pillClass = 'status-pill-neutral';
                const statusText = (m.status || 'draft').toUpperCase();
                if (m.status === 'approved') pillClass = 'status-pill-completed';
                else if (m.status === 'submitted') pillClass = 'status-pill-progress';
                else if (m.status === 'rejected') pillClass = 'status-pill-delayed';

                const activity = activities.find(a => a.id === m.activity_id);

                return (
                  <tr key={m.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-slate-900">
                      {activity?.name || m.activity_id}
                      {activity?.wbs_code && (
                        <span className="ml-2 font-mono text-[11px] font-normal text-slate-500">
                          ({activity.wbs_code})
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                      {m.quantity} {activity?.unit || ''}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-600">{m.measurement_date}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`status-pill ${pillClass}`}>
                        <span className="status-pill-dot" />
                        {statusText}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {m.status === 'draft' && (
                        <button
                          disabled={busy}
                          onClick={() => send({ measurementId: m.id, action: 'submit' }, 'PATCH')}
                          className="font-semibold text-blue-600 hover:text-blue-700"
                        >
                          Submit
                        </button>
                      )}
                      {m.status === 'submitted' && canReview && (
                        <span className="inline-flex items-center gap-3">
                          <button
                            disabled={busy}
                            onClick={() => send({ measurementId: m.id, action: 'approve' }, 'PATCH')}
                            className="font-semibold text-emerald-600 hover:text-emerald-700"
                          >
                            Approve
                          </button>
                          <button
                            disabled={busy}
                            onClick={() =>
                              send(
                                { measurementId: m.id, action: 'reject', rejectionReason: 'Rejected by reviewer' },
                                'PATCH'
                              )
                            }
                            className="font-semibold text-rose-600 hover:text-rose-700"
                          >
                            Reject
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!measurements.length && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">
                    No measurements recorded for this project yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
