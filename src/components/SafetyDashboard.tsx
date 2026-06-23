// Safety and EHS Dashboard Component (Page 10)
import React, { useState } from 'react';

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

  const canEdit = ['super_admin', 'project_manager', 'safety_officer'].includes(userRole);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAddSafetyLog({
      log_date: new Date().toISOString().split('T')[0],
      toolbox_talks: toolboxCount,
      incidents: incidentCount,
      near_misses: nearMissCount,
      permits_issued: permitCount,
      environmental_complaints: 0
    });
    setToolboxCount(0);
    setIncidentCount(0);
    setNearMissCount(0);
    setPermitCount(0);
    setShowAddForm(false);
    alert('Daily safety log registered.');
  };

  const cumulativeToolbox = safetyLogs.reduce((sum, s) => sum + Number(s.toolbox_talks || 0), 0);
  const cumulativeIncidents = safetyLogs.reduce((sum, s) => sum + Number(s.incidents || 0), 0);
  const cumulativeNearMisses = safetyLogs.reduce((sum, s) => sum + Number(s.near_misses || 0), 0);
  const cumulativePermits = safetyLogs.reduce((sum, s) => sum + Number(s.permits_issued || 0), 0);

  return (
    <div className="space-y-6">
      {/* Cumulative Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-800/50 border border-slate-700/40 p-4 rounded-xl text-center shadow">
          <div className="text-slate-400 text-xs font-semibold">Toolbox Talks (Talks)</div>
          <div className="text-2xl font-bold mt-1 text-slate-100">{cumulativeToolbox}</div>
          <span className="text-[9px] text-slate-500 block mt-1">Pre-shift safety briefings</span>
        </div>

        <div className="bg-slate-800/50 border border-red-700/20 p-4 rounded-xl text-center shadow">
          <div className="text-slate-400 text-xs font-semibold">Safety Incidents</div>
          <div className="text-2xl font-bold mt-1 text-rose-400">{cumulativeIncidents}</div>
          <span className="text-[9px] text-rose-400 font-bold block mt-1">{cumulativeIncidents > 0 ? 'Urgent Review' : 'Zero Incident Target'}</span>
        </div>

        <div className="bg-slate-800/50 border border-amber-700/20 p-4 rounded-xl text-center shadow">
          <div className="text-slate-400 text-xs font-semibold">Near Misses Reported</div>
          <div className="text-2xl font-bold mt-1 text-amber-400">{cumulativeNearMisses}</div>
          <span className="text-[9px] text-slate-500 block mt-1">Hazard identifications logged</span>
        </div>

        <div className="bg-slate-800/50 border border-slate-700/40 p-4 rounded-xl text-center shadow">
          <div className="text-slate-400 text-xs font-semibold">Active Work Permits</div>
          <div className="text-2xl font-bold mt-1 text-slate-100">{cumulativePermits}</div>
          <span className="text-[9px] text-slate-500 block mt-1">Height, excav, electrical permits</span>
        </div>
      </div>

      {/* Action Header */}
      <div className="flex justify-between items-center bg-slate-800/40 p-4 border border-slate-700/30 rounded-xl shadow">
        <div>
          <h2 className="text-slate-200 text-base font-semibold">EHS & Safety Management Control</h2>
          <p className="text-xs text-slate-400">Record daily safety audits, register hazard issues, and manage hot work / confined space permits.</p>
        </div>
        {canEdit && (
          <button 
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow transition"
          >
            🦺 Log Daily Safety Record
          </button>
        )}
      </div>

      {/* Add form */}
      {showAddForm && (
        <form onSubmit={handleSubmit} className="bg-slate-800/80 border border-slate-700 p-4 rounded-xl space-y-4 max-w-md shadow-lg text-xs">
          <h3 className="text-slate-200 font-bold uppercase tracking-wider">Log Site Safety parameters</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 mb-1">Toolbox Talks Count</label>
              <input
                type="number"
                value={toolboxCount}
                onChange={(e) => setToolboxCount(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-slate-200"
                required
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Incidents recorded</label>
              <input
                type="number"
                value={incidentCount}
                onChange={(e) => setIncidentCount(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-slate-200"
                required
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Near Misses reported</label>
              <input
                type="number"
                value={nearMissCount}
                onChange={(e) => setNearMissCount(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-slate-200"
                required
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Work Permits Issued</label>
              <input
                type="number"
                value={permitCount}
                onChange={(e) => setPermitCount(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-slate-200"
                required
              />
            </div>
          </div>
          <button type="submit" className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded shadow transition">
            Save Safety Log
          </button>
        </form>
      )}

      {/* Safety Logs register */}
      <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-5 shadow-lg">
        <h3 className="text-slate-200 text-sm font-semibold mb-4">Site Safety Audit History</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400 font-semibold">
                <th className="pb-3">Audit Date</th>
                <th className="pb-3 text-right">Toolbox Talks</th>
                <th className="pb-3 text-right">Safety Incidents</th>
                <th className="pb-3 text-right">Near Misses</th>
                <th className="pb-3 text-right">Permits Issued</th>
                <th className="pb-3 text-right pr-2">Environmental Complaints</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {safetyLogs.map(log => (
                <tr key={log.id} className="hover:bg-slate-800/10">
                  <td className="py-2.5 font-bold font-mono text-slate-200">{log.log_date}</td>
                  <td className="py-2.5 text-right font-mono">{log.toolbox_talks}</td>
                  <td className={`py-2.5 text-right font-mono font-bold ${log.incidents > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{log.incidents}</td>
                  <td className="py-2.5 text-right font-mono text-amber-400">{log.near_misses}</td>
                  <td className="py-2.5 text-right font-mono">{log.permits_issued}</td>
                  <td className="py-2.5 text-right font-mono pr-2">{log.environmental_complaints}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
