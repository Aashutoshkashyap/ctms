// Executive Dashboard Component (Page 1)
import React from 'react';
import { Activity } from '../lib/cpm';
import { EVMMetrics } from '../lib/evm';
import { formatDate } from '../lib/cpm';

interface ExecutiveDashboardProps {
  project: any;
  activities: Activity[];
  evm: EVMMetrics;
  designPackages: any[];
  ipcSubmissions: any[];
  claims: any[];
  qaqc: any[];
  safety: any[];
  risks: any[];
  alerts: Array<{ type: string; message: string; severity: 'warning' | 'critical' | 'info' }>;
  currentDate: string;
}

export default function ExecutiveDashboard({
  project,
  activities,
  evm,
  designPackages,
  ipcSubmissions,
  claims,
  qaqc,
  safety,
  risks,
  alerts,
  currentDate
}: ExecutiveDashboardProps) {
  // Elapsed time math
  const start = new Date(project.start_date);
  const cur = new Date(currentDate);
  const diffTime = Math.max(0, cur.getTime() - start.getTime());
  const elapsedDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const elapsedPercent = Math.min(100, Math.round((elapsedDays / project.contract_duration_days) * 100));

  // Projected Completion calculations
  let calculatedFinish = project.target_completion_date;
  activities.forEach(a => {
    if (a.early_finish && a.early_finish > calculatedFinish) {
      calculatedFinish = a.early_finish;
    }
  });

  const finishDiff = Math.ceil((new Date(calculatedFinish).getTime() - new Date(project.target_completion_date).getTime()) / (1000 * 3600 * 24));
  const delayDays = Math.max(0, finishDiff);

  // Financial Summaries
  const totalClaimed = ipcSubmissions.reduce((sum, i) => sum + Number(i.claimed_amount || 0), 0);
  const totalCertified = ipcSubmissions.reduce((sum, i) => sum + Number(i.certified_amount || 0), 0);
  const totalPaid = ipcSubmissions.reduce((sum, i) => {
    if (i.status === 'paid') return sum + Number(i.paid_amount || i.certified_amount || 0);
    return sum;
  }, 0);

  // Critical activities that are delayed
  const delayedCritical = activities.filter(a => a.is_critical && a.status !== 'completed' && (
    a.status === 'not_started' && currentDate > a.baseline_start ||
    a.status === 'in_progress' && (a.actual_quantity / (a.planned_quantity || 1)) < 0.8
  ));
  const criticalPath = activities
    .filter(a => a.is_critical)
    .sort((a, b) => (a.early_start || a.baseline_start).localeCompare(b.early_start || b.baseline_start));

  // Design/QC stats
  const pendingDesigns = designPackages.filter(p => p.status !== 'approved').length;
  const failedQc = qaqc.filter(q => q.status === 'failed').length;
  const openClaims = claims.filter(c => c.status !== 'approved' && c.status !== 'rejected').length;

  // Safety incidents
  const totalIncidents = safety.reduce((sum, s) => sum + Number(s.incidents || 0), 0);

  // Risk score calculation
  const openRisks = risks.filter(r => r.status !== 'closed');
  const riskScore = Math.min(100, Math.round(
    (openRisks.reduce((sum, r) => sum + (r.probability * r.impact), 0) / (openRisks.length || 1) / 25) * 100
  ));

  return (
    <div className="space-y-6">
      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Contract & Progress */}
        <div className="bg-slate-800/80 border border-slate-700/50 p-4 rounded-xl shadow-lg relative overflow-hidden">
          <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Contract Amount</div>
          <div className="text-2xl font-bold mt-1 text-slate-100">{project.currency} {(project.contract_amount / 1000000).toFixed(1)}M</div>
          <div className="flex justify-between items-center mt-3 text-xs">
            <span className="text-slate-400">Elapsed:</span>
            <span className="font-semibold text-slate-200">{elapsedDays} / {project.contract_duration_days} days ({elapsedPercent}%)</span>
          </div>
          <div className="w-full bg-slate-700 h-1.5 rounded-full mt-2 overflow-hidden">
            <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${elapsedPercent}%` }}></div>
          </div>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/50 p-4 rounded-xl shadow-lg">
          <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Physical Progress</div>
          <div className="flex flex-col gap-1 mt-1">
            <span className="text-3xl font-extrabold text-slate-100">{evm.actualProgress.toFixed(1)}%</span>
            <span className="text-xs text-slate-400">Planned progress: <strong className="text-slate-600">{evm.plannedProgress.toFixed(1)}%</strong></span>
          </div>
          <div className="flex justify-between items-center mt-3 text-xs">
            <span className="text-slate-400">Schedule Variance:</span>
            <span className={`font-semibold px-2 py-0.5 rounded ${evm.scheduleVariance >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
              {evm.scheduleVariance >= 0 ? '+' : ''}{evm.scheduleVariance.toFixed(1)}%
            </span>
          </div>
          <div className="w-full bg-slate-700 h-1.5 rounded-full mt-2 overflow-hidden relative">
            <div className="bg-blue-400/30 h-1.5 absolute rounded-full" style={{ width: `${evm.plannedProgress}%` }}></div>
            <div className="bg-emerald-400 h-1.5 absolute rounded-full" style={{ width: `${evm.actualProgress}%` }}></div>
          </div>
        </div>

        {/* Schedule Forecast */}
        <div className="bg-slate-800/80 border border-slate-700/50 p-4 rounded-xl shadow-lg relative">
          <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Timeline Projection</div>
          <div className="text-lg font-bold mt-1 text-slate-100">{formatDate(calculatedFinish)}</div>
          <div className="flex justify-between items-center mt-3 text-xs">
            <span className="text-slate-400">Current Delay:</span>
            <span className={`font-semibold ${delayDays > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {delayDays > 0 ? `+${delayDays} days` : 'On Track'}
            </span>
          </div>
          <div className="text-[10px] text-slate-500 mt-2">
            Target Completion: {formatDate(project.target_completion_date)}
          </div>
        </div>

        {/* Project Health Index */}
        <div className="bg-slate-800/80 border border-slate-700/50 p-4 rounded-xl shadow-lg">
          <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Earned Value Ratios</div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div className="border border-slate-700/30 p-1.5 rounded bg-slate-900/30 text-center">
              <div className="text-[10px] text-slate-500">SPI (Schedule)</div>
              <div className={`text-lg font-bold ${evm.spi >= 1.0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {evm.spi.toFixed(2)}
              </div>
            </div>
            <div className="border border-slate-700/30 p-1.5 rounded bg-slate-900/30 text-center">
              <div className="text-[10px] text-slate-500">CPI (Cost)</div>
              <div className={`text-lg font-bold ${evm.cpi >= 1.0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {evm.cpi.toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Second Row: Chart and Critical Path */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Progress Curve SVG */}
        <div className="lg:col-span-2 bg-slate-800/50 border border-slate-700/40 p-5 rounded-xl shadow-lg">
          <h3 className="text-slate-200 text-sm font-semibold mb-4 flex items-center justify-between">
            <span>Physical Progress S-Curve (Planned vs Actual)</span>
            <span className="text-xs font-normal text-slate-400 truncate max-w-[45%]">{project.name}</span>
          </h3>
          <div className="relative h-64 bg-slate-900/40 border border-slate-800 rounded-lg p-2 flex items-center justify-center">
            {/* Draw a Custom S-Curve Chart using SVG */}
            <svg className="w-full h-full" viewBox="0 0 500 200" preserveAspectRatio="none">
              {/* Grid Lines */}
              <line x1="0" y1="50" x2="500" y2="50" stroke="#334155" strokeWidth="0.5" strokeDasharray="3" />
              <line x1="0" y1="100" x2="500" y2="100" stroke="#334155" strokeWidth="0.5" strokeDasharray="3" />
              <line x1="0" y1="150" x2="500" y2="150" stroke="#334155" strokeWidth="0.5" strokeDasharray="3" />
              
              {/* Planned S-Curve Path */}
              <path 
                d={`M 0 200 C 150 180, 250 50, 500 0`} 
                fill="none" 
                stroke="#38bdf8" 
                strokeWidth="2.5" 
                strokeDasharray="4"
              />
              
              {/* Actual S-Curve Path (representing current 35% actual progress vs 42% planned) */}
              <path 
                d={`M 0 200 C 100 195, 180 155, 230 130`} 
                fill="none" 
                stroke="#10b981" 
                strokeWidth="3" 
              />

              {/* Data Node dots */}
              <circle cx="230" cy="130" r="4" fill="#10b981" />
              <text x="240" y="125" fill="#10b981" className="text-[10px] font-bold">Actual: {evm.actualProgress.toFixed(1)}%</text>
              <circle cx="230" cy="115" r="4" fill="#38bdf8" />
              <text x="240" y="110" fill="#38bdf8" className="text-[10px] font-bold">Planned: {evm.plannedProgress.toFixed(1)}%</text>
            </svg>
            <div className="absolute bottom-2 left-2 text-[10px] text-slate-500">{formatDate(project.start_date)} (Start)</div>
            <div className="absolute bottom-2 right-2 text-[10px] text-slate-500">{formatDate(project.target_completion_date)} (Target)</div>
          </div>
          <div className="flex gap-4 mt-3 text-xs justify-center">
            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-sky-400 inline-block border-t border-dashed border-sky-400"></span> Planned Baseline Curve</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-emerald-500 inline-block"></span> Actual Progress Curve</span>
          </div>
        </div>

        {/* CPM Critical Path Panel */}
        <div className="bg-slate-800/50 border border-slate-700/40 p-5 rounded-xl shadow-lg flex flex-col">
          <h3 className="text-slate-200 text-sm font-semibold mb-4">CPM Critical Path Delayed</h3>
          
          {delayedCritical.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-4 border border-dashed border-slate-700 rounded-lg">
              <span className="text-emerald-400 text-2xl">✓</span>
              <span className="text-slate-400 text-xs font-medium mt-1">All Critical Activities on Schedule</span>
            </div>
          ) : (
            <div className="flex-1 space-y-3 overflow-y-auto max-h-[220px] pr-1">
              {delayedCritical.map(act => {
                const actualProgress = act.planned_quantity > 0 ? (act.actual_quantity / act.planned_quantity) * 100 : 0;
                return (
                  <div key={act.id} className="border border-red-500/20 bg-red-500/5 p-3 rounded-lg flex flex-col space-y-1">
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-semibold text-slate-200">{act.name}</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 bg-red-500/10 text-red-400 rounded uppercase">Critical</span>
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                      <span>WBS: {act.wbs_code}</span>
                      <span>Progress: {actualProgress.toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-slate-700 h-1 rounded-full overflow-hidden mt-1">
                      <div className="bg-red-400 h-1" style={{ width: `${actualProgress}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Quick Critical Path Visual Map */}
          <div className="mt-4 border-t border-slate-700/30 pt-3">
            <div className="text-xs font-semibold text-slate-400 mb-2">CPM Critical Path Order:</div>
            {criticalPath.length === 0 ? (
              <div className="text-[10px] text-slate-500 py-1">
                {activities.length === 0
                  ? 'No schedule activities yet. Generate or add a WBS to establish the critical path.'
                  : 'No zero-float path yet; the current activity network finishes within the contract completion date.'}
              </div>
            ) : (
              <div className="flex items-center text-[10px] gap-1 overflow-x-auto py-1">
                {criticalPath.map((activity, index) => (
                  <React.Fragment key={activity.id}>
                    {index > 0 && <span className="text-slate-500">→</span>}
                    <span className="bg-slate-800 text-slate-300 border border-slate-700 px-1.5 py-0.5 rounded whitespace-nowrap">
                      {activity.name}
                    </span>
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Third Row: Gaps & Alert Center */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Financial Gaps Analysis */}
        <div className="bg-slate-800/50 border border-slate-700/40 p-5 rounded-xl shadow-lg md:col-span-1">
          <h3 className="text-slate-200 text-sm font-semibold mb-4">Contract Billing Gaps</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">Billing Gap (Work vs Claimed)</span>
                <span className="font-semibold text-slate-200">NPR {(evm.billingGap / 1000000).toFixed(2)}M</span>
              </div>
              <div className="w-full bg-slate-700 h-2 rounded overflow-hidden">
                <div className="bg-amber-500 h-2" style={{ width: `${Math.min(100, (evm.billingGap / evm.earnedValue) * 100)}%` }}></div>
              </div>
              <div className="text-[10px] text-slate-500 mt-1">Work completed but not yet submitted in IPC.</div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">Payment Gap (Cert vs Received)</span>
                <span className="font-semibold text-slate-200">NPR {(evm.paymentGap / 1000000).toFixed(2)}M</span>
              </div>
              <div className="w-full bg-slate-700 h-2 rounded overflow-hidden">
                <div className="bg-orange-500 h-2" style={{ width: `${Math.min(100, (evm.paymentGap / (totalCertified || 1)) * 100)}%` }}></div>
              </div>
              <div className="text-[10px] text-slate-500 mt-1">IPC certified by consultant but payment delayed.</div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">Cash Gap (Expenses vs Paid)</span>
                <span className="font-semibold text-slate-200">NPR {(evm.cashGap / 1000000).toFixed(2)}M</span>
              </div>
              <div className="w-full bg-slate-700 h-2 rounded overflow-hidden">
                <div className="bg-red-500 h-2" style={{ width: `${Math.min(100, (evm.cashGap / (evm.actualCost || 1)) * 100)}%` }}></div>
              </div>
              <div className="text-[10px] text-slate-500 mt-1">Cash deficit pressure on subcontractor/vendor payments.</div>
            </div>
          </div>
        </div>

        {/* Smart Alerts Feed */}
        <div className="bg-slate-800/50 border border-slate-700/40 p-5 rounded-xl shadow-lg md:col-span-2 flex flex-col">
          <h3 className="text-slate-200 text-sm font-semibold mb-3 flex items-center justify-between">
            <span>Smart Alerts Center</span>
            <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full font-normal">
              {alerts.length} Active
            </span>
          </h3>
          <div className="flex-1 space-y-2 overflow-y-auto max-h-[220px] pr-1">
            {alerts.length === 0 ? (
              <div className="text-center text-slate-500 py-8 text-xs">No notifications or risk alerts.</div>
            ) : (
              alerts.map((al, idx) => {
                let borderClass = 'border-blue-500/20 bg-blue-500/5 text-blue-400';
                let icon = 'ℹ️';
                if (al.severity === 'critical') {
                  borderClass = 'border-red-500/30 bg-red-500/5 text-red-400 animate-pulse';
                  icon = '🚨';
                } else if (al.severity === 'warning') {
                  borderClass = 'border-amber-500/30 bg-amber-500/5 text-amber-400';
                  icon = '⚠️';
                }
                
                return (
                  <div key={idx} className={`border p-2.5 rounded-lg flex items-start gap-2 text-xs ${borderClass}`}>
                    <span className="text-sm leading-none mt-0.5">{icon}</span>
                    <div className="flex-1">
                      <div className="font-semibold capitalize flex justify-between">
                        <span>{al.type} Alert</span>
                      </div>
                      <p className="text-slate-300 mt-0.5">{al.message}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
      
      {/* Detail quick grid stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 border-t border-slate-800 pt-4">
        <div className="p-3 bg-slate-800/20 rounded-lg text-center border border-slate-800">
          <div className="text-[10px] text-slate-500">Design Submissions</div>
          <div className="text-lg font-bold text-slate-200 mt-1">{designPackages.length}</div>
          <div className="text-[9px] text-slate-400">{pendingDesigns} Pending Approval</div>
        </div>
        <div className="p-3 bg-slate-800/20 rounded-lg text-center border border-slate-800">
          <div className="text-[10px] text-slate-500">QA/QC Inspections</div>
          <div className="text-lg font-bold text-slate-200 mt-1">{qaqc.length}</div>
          <div className="text-[9px] text-red-400">{failedQc} Failed NCRs</div>
        </div>
        <div className="p-3 bg-slate-800/20 rounded-lg text-center border border-slate-800">
          <div className="text-[10px] text-slate-500">Contract Claims</div>
          <div className="text-lg font-bold text-slate-200 mt-1">{claims.length}</div>
          <div className="text-[9px] text-amber-400">{openClaims} Under Dispute</div>
        </div>
        <div className="p-3 bg-slate-800/20 rounded-lg text-center border border-slate-800">
          <div className="text-[10px] text-slate-500">Safety Incidents</div>
          <div className="text-lg font-bold text-rose-400 mt-1">{totalIncidents}</div>
          <div className="text-[9px] text-slate-400">Zero LTI target</div>
        </div>
        <div className="p-3 bg-slate-800/20 rounded-lg text-center border border-slate-800 col-span-2 md:col-span-1">
          <div className="text-[10px] text-slate-500">Project Delay Risk</div>
          <div className="text-lg font-bold text-amber-400 mt-1">{riskScore}%</div>
          <div className="text-[9px] text-slate-400">Moderate Category</div>
        </div>
      </div>
    </div>
  );
}
