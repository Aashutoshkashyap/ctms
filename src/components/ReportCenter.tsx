'use client';

import { useEffect, useState } from 'react';
import { BarChart } from '@mui/x-charts/BarChart';
import { storage } from '../lib/storage';
import { csvSafeRows } from '../lib/reportSafety';
import { PageHeader, SectionHeader } from './ManagementUI';

const reportTypes = ['daily', 'weekly', 'monthly', 'ipc', 'claims', 'quality', 'safety', 'handover'] as const;
type ReportType = typeof reportTypes[number];
type Report = { title: string; html: string; rows: unknown[][]; financials: Record<string, number>; generatedAt: string };

export default function ReportCenter({ projectId }: { projectId: string }) {
  const [type, setType] = useState<ReportType>('monthly'); const [report, setReport] = useState<Report | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [showPreview, setShowPreview] = useState(false);
  const headers = async () => ({ Authorization: `Bearer ${(await storage.getAuthSession())?.access_token || ''}` });
  const load = async (signal: AbortSignal) => { setLoading(true); setReport(null); setError(''); setShowPreview(false); try { const requestHeaders = await headers(); if (signal.aborted) return; const response = await fetch(`/api/reports?projectId=${encodeURIComponent(projectId)}&type=${type}`, { headers: requestHeaders, cache: 'no-store', signal }); const payload = await response.json().catch(() => ({})); if (signal.aborted) return; if (!response.ok) throw new Error(payload.error || 'The report could not be generated.'); setReport(payload); } catch (cause) { if (!signal.aborted) setError(cause instanceof Error ? cause.message : 'The report could not be generated.'); } finally { if (!signal.aborted) setLoading(false); } };
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [projectId, type]);
  const download = (format: 'html' | 'csv' | 'json') => {
    if (!report) return;
    const body = format === 'html' ? report.html : format === 'csv' ? csvSafeRows(report.rows) : JSON.stringify({ title: report.title, generatedAt: report.generatedAt, financials: report.financials, rows: report.rows }, null, 2);
    const mime = format === 'html' ? 'text/html' : format === 'csv' ? 'text/csv' : 'application/json';
    const url = URL.createObjectURL(new Blob([body], { type: `${mime};charset=utf-8` })); const link = document.createElement('a'); link.href = url; link.download = `${type}-report.${format}`; link.click(); URL.revokeObjectURL(url);
  };
  return <section className="space-y-5 text-sm"><PageHeader eyebrow="Reports" title="Project reports" description="Explore a project report, then preview or export the same authorized result." />
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><label className="block max-w-sm font-semibold text-slate-700">Report area<select value={type} onChange={event => setType(event.target.value as ReportType)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-950">{reportTypes.map(value => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)} report</option>)}</select></label></div>
    {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 font-semibold text-rose-900">{error}</p>}
    {!loading && report && <><SectionHeader title={report.title} description={`Generated ${new Date(report.generatedAt).toLocaleString()} · ${report.rows?.length || 0} rows`} />{['monthly','ipc','claims'].includes(type) && <><dl className="grid gap-3 sm:grid-cols-4"><Metric label="Original contract" value={report.financials.contractAmount}/><Metric label="Revised contract" value={report.financials.revisedContractAmount}/><Metric label="Certified" value={report.financials.certifiedAmount}/><Metric label="Outstanding" value={report.financials.outstandingAmount}/></dl><div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><SectionHeader title="Commercial values" description="Contract, certified and outstanding are distinct amounts." /><BarChart layout="horizontal" height={250} yAxis={[{ scaleType: 'band', data: ['Original', 'Revised', 'Certified', 'Outstanding'] }]} xAxis={[{ min: 0, valueFormatter: (value: number) => `NPR ${Math.round(value).toLocaleString()}` }]} series={[{ data: [report.financials.contractAmount, report.financials.revisedContractAmount, report.financials.certifiedAmount, report.financials.outstandingAmount].map(value => Math.max(0, Number(value) || 0)), color: '#2563eb' }]} borderRadius={4} skipAnimation /></div></>}<div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-4"><button onClick={() => setShowPreview(value => !value)} className="rounded-lg bg-blue-700 px-3 py-2 font-bold text-white">{showPreview ? 'Hide preview' : 'Preview report'}</button><button onClick={() => download('html')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-bold text-slate-800">Download HTML</button><button onClick={() => download('csv')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-bold text-slate-800">Export CSV</button><button onClick={() => download('json')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-bold text-slate-800">Export JSON</button></div>{showPreview && <iframe title={`${report.title} preview`} sandbox="" srcDoc={report.html} className="min-h-[580px] w-full rounded-xl border border-slate-300 bg-white" />}</>}
    {loading && <p className="rounded-xl border border-slate-200 bg-white p-5 text-slate-600">Loading authorized report data…</p>}
  </section>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"><dt className="text-xs font-bold uppercase text-slate-500">{label}</dt><dd className="mt-1 font-mono text-base font-extrabold text-slate-900">NPR {Number(value || 0).toLocaleString()}</dd></div>; }
