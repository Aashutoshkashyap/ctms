'use client';

import { useEffect, useState } from 'react';
import { storage } from '../lib/storage';
import { csvSafeRows } from '../lib/reportSafety';

const reportTypes = ['daily', 'weekly', 'monthly', 'ipc', 'claims', 'quality', 'safety', 'handover'] as const;
type ReportType = typeof reportTypes[number];
type Report = { title: string; html: string; rows: unknown[][]; financials: Record<string, number>; generatedAt: string };

export default function ReportCenter({ projectId }: { projectId: string }) {
  const [type, setType] = useState<ReportType>('monthly'); const [report, setReport] = useState<Report | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const headers = async () => ({ Authorization: `Bearer ${(await storage.getAuthSession())?.access_token || ''}` });
  const load = async () => { setLoading(true); setError(''); const response = await fetch(`/api/reports?projectId=${encodeURIComponent(projectId)}&type=${type}`, { headers: await headers(), cache: 'no-store' }); const payload = await response.json().catch(() => ({})); if (!response.ok) { setReport(null); setError(payload.error || 'The report could not be generated.'); } else setReport(payload); setLoading(false); };
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [projectId, type]);
  const download = (format: 'html' | 'csv' | 'json') => {
    if (!report) return;
    const body = format === 'html' ? report.html : format === 'csv' ? csvSafeRows(report.rows) : JSON.stringify({ title: report.title, generatedAt: report.generatedAt, financials: report.financials, rows: report.rows }, null, 2);
    const mime = format === 'html' ? 'text/html' : format === 'csv' ? 'text/csv' : 'application/json';
    const url = URL.createObjectURL(new Blob([body], { type: `${mime};charset=utf-8` })); const link = document.createElement('a'); link.href = url; link.download = `${type}-report.${format}`; link.click(); URL.revokeObjectURL(url);
  };
  return <section className="space-y-5 text-sm"><header className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="text-lg font-extrabold text-slate-900">Reports & exports</h2><p className="mt-1 text-slate-600">Report data is loaded from the authorized project server boundary. Preview and exports use the same canonical totals.</p></header>
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">{reportTypes.map(value => <button key={value} onClick={() => setType(value)} className={`rounded-lg border p-3 font-semibold capitalize ${type === value ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{value} report</button>)}</div>
    {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 font-semibold text-rose-900">{error}</p>}
    {report && <><div className="flex flex-wrap gap-2"><button onClick={() => download('html')} className="rounded-lg bg-emerald-700 px-3 py-2 font-bold text-white">Download HTML</button><button onClick={() => download('csv')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-bold text-slate-800">Export CSV</button><button onClick={() => download('json')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-bold text-slate-800">Export JSON</button></div><dl className="grid gap-3 sm:grid-cols-4"><Metric label="Contract" value={report.financials.contractAmount}/><Metric label="Revised value" value={report.financials.revisedContractAmount}/><Metric label="Certified" value={report.financials.certifiedAmount}/><Metric label="Outstanding" value={report.financials.outstandingAmount}/></dl><iframe title={`${report.title} preview`} sandbox="" srcDoc={report.html} className="min-h-[580px] w-full rounded-xl border border-slate-300 bg-white" /></>}
    {loading && <p className="rounded-xl border border-slate-200 bg-white p-5 text-slate-600">Loading authorized report data…</p>}
  </section>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"><dt className="text-xs font-bold uppercase text-slate-500">{label}</dt><dd className="mt-1 font-mono text-base font-extrabold text-slate-900">NPR {Number(value || 0).toLocaleString()}</dd></div>; }
