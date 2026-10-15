// Safety and EHS Dashboard Component (Page 10)
import React, { useState } from 'react';
import BsDatePicker from './BsDatePicker';
import { storage } from '../lib/storage';
import { formatBsDate, todayAdDate } from '../lib/nepaliDate';
import UploadProgress from './UploadProgress';
import { useSubmissionLock } from '../lib/useSubmissionLock';

interface SafetyDashboardProps {
  safetyLogs: any[];
  onAddSafetyLog: (log: any) => void;
  userRole: string;
}

export default function SafetyDashboard({
  safetyLogs,
  onAddSafetyLog,
  userRole
}: SafetyDashboardProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [toolboxCount, setToolboxCount] = useState(0);
  const [incidentCount, setIncidentCount] = useState(0);
  const [nearMissCount, setNearMissCount] = useState(0);
  const [permitCount, setPermitCount] = useState(0);
  const [environmentalCount, setEnvironmentalCount] = useState(0);
  const [logDate, setLogDate] = useState(todayAdDate());
  const [reportFile, setReportFile] = useState<File | null>(null);
  const { busy: saving, run: runUpload } = useSubmissionLock();

  const canEdit = ['project_director', 'project_manager', 'safety_officer'].includes(userRole);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const requiresReport = incidentCount > 0 || environmentalCount > 0;
    if (requiresReport && !reportFile) {
      window.alert('Upload the incident or environmental compliance report before saving this event.');
      return;
    }
    await runUpload(async () => { let compliance_report_path = '';
    let compliance_report_url = '';
    try {
      if (reportFile) {
        const uploaded = await storage.uploadProjectDocument(reportFile, 'compliance_report', `safety-${logDate}-${Date.now()}`, 'Safety Team', `Safety/EHS report for ${formatBsDate(logDate)}`);
        compliance_report_path = uploaded.storage_path || '';
        compliance_report_url = uploaded.url || '';
      }
    onAddSafetyLog({
      log_date: logDate,
      toolbox_talks: toolboxCount,
      incidents: incidentCount,
      near_misses: nearMissCount,
      permits_issued: permitCount,
      environmental_complaints: environmentalCount,
      compliance_report_path,
      compliance_report_url,
    });
    setToolboxCount(0);
    setIncidentCount(0);
    setNearMissCount(0);
    setPermitCount(0);
    setEnvironmentalCount(0);
    setReportFile(null);
    setShowAddForm(false);
    alert('Daily safety log registered.');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not save the safety evidence.');
    } });
  };

  const cumulativeToolbox = safetyLogs.reduce((sum, s) => sum + Number(s.toolbox_talks || 0), 0);
  const cumulativeIncidents = safetyLogs.reduce((sum, s) => sum + Number(s.incidents || 0), 0);
  const cumulativeNearMisses = safetyLogs.reduce((sum, s) => sum + Number(s.near_misses || 0), 0);
  const cumulativePermits = safetyLogs.reduce((sum, s) => sum + Number(s.permits_issued || 0), 0);

  return (
    <div className="space-y-6">
      <UploadProgress active={saving} label="Uploading and securing the safety report…" />

      {/* Cumulative Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200/90 p-5 rounded-2xl shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Toolbox Talks</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 text-sm">🗣️</span>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 font-mono">{cumulativeToolbox}</div>
          <span className="text-[11px] text-slate-500 block">Pre-shift safety briefings</span>
        </div>

        <div className="bg-white border border-slate-200/90 p-5 rounded-2xl shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Safety Incidents</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600 text-sm">🚨</span>
          </div>
          <div className={`text-2xl font-extrabold font-mono ${cumulativeIncidents > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
            {cumulativeIncidents}
          </div>
          <span className={`text-[11px] font-semibold block ${cumulativeIncidents > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
            {cumulativeIncidents > 0 ? 'Immediate Review Required' : 'Zero Incident Target Achieved'}
          </span>
        </div>

        <div className="bg-white border border-slate-200/90 p-5 rounded-2xl shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Near Misses</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600 text-sm">⚠️</span>
          </div>
          <div className="text-2xl font-extrabold text-amber-600 font-mono">{cumulativeNearMisses}</div>
          <span className="text-[11px] text-slate-500 block">Hazard proactive logs</span>
        </div>

        <div className="bg-white border border-slate-200/90 p-5 rounded-2xl shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Active Work Permits</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 text-sm">📜</span>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 font-mono">{cumulativePermits}</div>
          <span className="text-[11px] text-slate-500 block">Height, hot work & excavation</span>
        </div>
      </div>

      {/* Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 border border-slate-200/90 rounded-2xl shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 text-sm">🦺</span>
            <h2 className="text-slate-900 text-base font-bold">EHS & Safety Management Control</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">Record daily safety audits, register hazard issues, and manage hot work / confined space permits.</p>
        </div>
        {canEdit && (
          <button 
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition"
          >
            {showAddForm ? '✕ Close Form' : '+ Log Daily Safety Record'}
          </button>
        )}
      </div>

      {/* Add form */}
      {showAddForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-blue-200 p-5 rounded-2xl space-y-4 max-w-2xl shadow-xs text-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="text-slate-900 font-bold text-sm">Log Site Safety Parameters</h3>
            <span className="text-[10px] text-slate-400">Daily EHS Log</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-slate-700 font-semibold mb-1">Audit Date (BS)</label>
              <BsDatePicker required value={logDate} onChange={setLogDate} />
            </div>
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Toolbox Talks Count</label>
              <input
                type="number"
                value={toolboxCount}
                onChange={(e) => setToolboxCount(Number(e.target.value))}
                className="w-full bg-white border border-slate-300 p-2.5 rounded-xl text-slate-900 text-xs outline-none focus:border-blue-600"
                required
              />
            </div>
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Incidents Recorded</label>
              <input
                type="number"
                value={incidentCount}
                onChange={(e) => setIncidentCount(Number(e.target.value))}
                className="w-full bg-white border border-slate-300 p-2.5 rounded-xl text-slate-900 text-xs outline-none focus:border-blue-600"
                required
              />
            </div>
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Near Misses Reported</label>
              <input
                type="number"
                value={nearMissCount}
                onChange={(e) => setNearMissCount(Number(e.target.value))}
                className="w-full bg-white border border-slate-300 p-2.5 rounded-xl text-slate-900 text-xs outline-none focus:border-blue-600"
                required
              />
            </div>
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Work Permits Issued</label>
              <input
                type="number"
                value={permitCount}
                onChange={(e) => setPermitCount(Number(e.target.value))}
                className="w-full bg-white border border-slate-300 p-2.5 rounded-xl text-slate-900 text-xs outline-none focus:border-blue-600"
                required
              />
            </div>
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Environmental Complaints</label>
              <input
                type="number"
                min="0"
                value={environmentalCount || ''}
                onChange={(e) => setEnvironmentalCount(Number(e.target.value))}
                className="w-full bg-white border border-slate-300 p-2.5 rounded-xl text-slate-900 text-xs outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Incident / Compliance Report</label>
              <input
                type="file"
                accept="application/pdf,image/*,.doc,.docx"
                onChange={(e) => setReportFile(e.target.files?.[0] || null)}
                className="w-full text-xs text-slate-600"
              />
              <span className="mt-1 block text-[10px] text-slate-500">Required when an incident or complaint is logged.</span>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowAddForm(false)} className="rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50 transition">
              Cancel
            </button>
            <button disabled={saving} type="submit" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs transition disabled:opacity-60">
              {saving ? 'Uploading…' : 'Save Safety Log'}
            </button>
          </div>
        </form>
      )}

      {/* Safety Logs register */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-slate-900 text-sm font-bold">Site Safety Audit History</h3>
            <p className="mt-1 text-xs text-slate-500">Historical compliance logs, permit tracking, and environmental incident reports.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {safetyLogs.length} Records
          </span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-3 px-3">Audit Date</th>
                <th className="py-3 px-3 text-right">Toolbox Talks</th>
                <th className="py-3 px-3 text-right">Incidents</th>
                <th className="py-3 px-3 text-right">Near Misses</th>
                <th className="py-3 px-3 text-right">Permits Issued</th>
                <th className="py-3 px-3 text-right">Environmental</th>
                <th className="py-3 px-3 text-right pr-4">Evidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {safetyLogs.map(log => (
                <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-3 font-semibold font-mono text-slate-900">{formatBsDate(log.log_date)}</td>
                  <td className="py-3 px-3 text-right font-mono text-slate-800">{log.toolbox_talks}</td>
                  <td className={`py-3 px-3 text-right font-mono font-bold ${log.incidents > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{log.incidents}</td>
                  <td className="py-3 px-3 text-right font-mono text-amber-600 font-semibold">{log.near_misses}</td>
                  <td className="py-3 px-3 text-right font-mono text-slate-800">{log.permits_issued}</td>
                  <td className="py-3 px-3 text-right font-mono text-slate-600">{log.environmental_complaints}</td>
                  <td className={`py-3 px-3 text-right font-semibold pr-4 ${log.compliance_report_path || log.compliance_report_url ? 'text-emerald-700' : (Number(log.incidents || 0) > 0 || Number(log.environmental_complaints || 0) > 0) ? 'text-rose-600' : 'text-slate-400'}`}>
                    {log.compliance_report_path || log.compliance_report_url ? '✓ Stored' : (Number(log.incidents || 0) > 0 || Number(log.environmental_complaints || 0) > 0) ? 'Required' : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
