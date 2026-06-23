// Expected vs Actual Progress Dashboard (Page 3)
import React, { useState } from 'react';
import { Activity } from '../lib/cpm';
import { EVMMetrics } from '../lib/evm';

interface ExpectedActualDashboardProps {
  activities: Activity[];
  evm: EVMMetrics;
  designPackages: any[];
  budgetHeads: any[];
  ipcSubmissions: any[];
  currentDate: string;
}

export default function ExpectedActualDashboard({
  activities,
  evm,
  designPackages,
  budgetHeads,
  ipcSubmissions,
  currentDate
}: ExpectedActualDashboardProps) {
  const [activeCase, setActiveCase] = useState<'progress' | 'cost' | 'design' | 'ipc'>('progress');

  // Calculate planned progress for activities
  const getActPlanned = (act: Activity): number => {
    const start = new Date(act.baseline_start);
    const finish = new Date(act.baseline_finish);
    const cur = new Date(currentDate);
    if (cur < start) return 0;
    if (cur > finish) return 100;
    const total = finish.getTime() - start.getTime();
    const elapsed = cur.getTime() - start.getTime();
    return total > 0 ? (elapsed / total) * 100 : 0;
  };

  return (
    <div className="space-y-6">
      {/* Use Case Tabs Selection */}
      <div className="flex bg-slate-900/60 p-1 rounded-lg border border-slate-800/80 max-w-2xl text-xs">
        <button 
          onClick={() => setActiveCase('progress')}
          className={`flex-1 py-2 text-center rounded-md font-semibold transition ${activeCase === 'progress' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
        >
          📈 Activity Progress
        </button>
        <button 
          onClick={() => setActiveCase('cost')}
          className={`flex-1 py-2 text-center rounded-md font-semibold transition ${activeCase === 'cost' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
        >
          💰 Cost Variance
        </button>
        <button 
          onClick={() => setActiveCase('design')}
          className={`flex-1 py-2 text-center rounded-md font-semibold transition ${activeCase === 'design' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
        >
          📐 Design Approvals
        </button>
        <button 
          onClick={() => setActiveCase('ipc')}
          className={`flex-1 py-2 text-center rounded-md font-semibold transition ${activeCase === 'ipc' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
        >
          📄 IPC Billing
        </button>
      </div>

      {/* Grid Content based on Selection */}
      <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-5 shadow-lg">
        {activeCase === 'progress' && (
          <div className="space-y-4">
            <h3 className="text-slate-200 text-sm font-semibold mb-2">Use Case 1: Physical Activity Progress Deviations</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400 font-semibold">
                    <th className="pb-3">WBS</th>
                    <th className="pb-3">Activity</th>
                    <th className="pb-3 text-right">Planned %</th>
                    <th className="pb-3 text-right">Actual %</th>
                    <th className="pb-3 text-right">Variance</th>
                    <th className="pb-3 pl-4">Primary Delay Reason</th>
                    <th className="pb-3">Mitigation / Corrective Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {activities.map(act => {
                    const planned = getActPlanned(act);
                    const actual = act.status === 'completed' ? 100 : (act.actual_quantity / (act.planned_quantity || 1)) * 100;
                    const variance = actual - planned;
                    
                    // Root causes and mitigations
                    let reason = '-';
                    let action = '-';
                    if (variance < -5) {
                      if (act.id === 'act-102') {
                        reason = 'Late approval cycle on Pile detailed calculations';
                        action = 'Deploy Coordinator for daily liaison with Kathmandu Consultant';
                      } else if (act.id === 'act-103') {
                        reason = 'Exceeded drawing review period by Employer Rep';
                        action = 'Submit Clause 8.4 EOT delay notice to preserve claims';
                      } else if (act.id === 'act-301') {
                        reason = 'Early monsoon flooding & Excavator engine breakdown';
                        action = 'Set up supplementary dewatering coffer-dams, add stand-by EX-05';
                      } else if (act.id === 'act-302') {
                        reason = 'Transit Mixer turnaround delay due to Lalitpur road blocks';
                        action = 'Rearrange delivery routes and schedule pours during night shifts';
                      } else {
                        reason = 'General resource shortfall';
                        action = 'Add backup crew and extend shift to 12 hours';
                      }
                    } else if (act.status === 'completed') {
                      reason = 'On Track / Completed';
                      action = 'Resources transitioned to succeeding CPM nodes';
                    }

                    return (
                      <tr key={act.id} className="hover:bg-slate-800/10">
                        <td className="py-2.5 font-mono text-slate-400">{act.wbs_code}</td>
                        <td className="py-2.5 font-semibold text-slate-100">{act.name}</td>
                        <td className="py-2.5 text-right">{planned.toFixed(0)}%</td>
                        <td className="py-2.5 text-right">{actual.toFixed(0)}%</td>
                        <td className="py-2.5 text-right">
                          <span className={`px-1 py-0.5 rounded font-bold ${variance >= 0 ? 'text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                            {variance >= 0 ? '+' : ''}{variance.toFixed(0)}%
                          </span>
                        </td>
                        <td className="py-2.5 pl-4 text-slate-400">{reason}</td>
                        <td className="py-2.5 text-blue-300 font-semibold">{action}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeCase === 'cost' && (
          <div className="space-y-4">
            <h3 className="text-slate-200 text-sm font-semibold mb-2">Use Case 2: Budget vs Actual Cost Variances</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400 font-semibold">
                    <th className="pb-3">WBS</th>
                    <th className="pb-3">Budget Head Name</th>
                    <th className="pb-3 text-right">Contract Value (NPR)</th>
                    <th className="pb-3 text-right">Internal Budget (NPR)</th>
                    <th className="pb-3 text-right">Actual Cost (NPR)</th>
                    <th className="pb-3 text-right">Cost Variance</th>
                    <th className="pb-3 pl-4">Cost Overrun Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {budgetHeads.map(bh => {
                    const variance = bh.internal_budget - bh.actual_cost;
                    let reason = 'Under budget / On Track';
                    if (bh.actual_cost > bh.internal_budget) {
                      reason = bh.wbs_code === '01' 
                        ? 'Steel reinforcement design updates forced structural engineering re-work'
                        : 'Subcontractor rates adjusted for bulk material inflation';
                    }

                    return (
                      <tr key={bh.id} className="hover:bg-slate-800/10">
                        <td className="py-2.5 font-mono text-slate-400">{bh.wbs_code}</td>
                        <td className="py-2.5 font-semibold text-slate-100">{bh.name}</td>
                        <td className="py-2.5 text-right font-mono">{(bh.contract_value).toLocaleString()}</td>
                        <td className="py-2.5 text-right font-mono">{(bh.internal_budget).toLocaleString()}</td>
                        <td className="py-2.5 text-right font-mono">{(bh.actual_cost).toLocaleString()}</td>
                        <td className={`py-2.5 text-right font-mono font-bold ${variance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {variance >= 0 ? 'Savings: +' : 'Deficit: '}{(variance).toLocaleString()}
                        </td>
                        <td className="py-2.5 pl-4 text-slate-400">{reason}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeCase === 'design' && (
          <div className="space-y-4">
            <h3 className="text-slate-200 text-sm font-semibold mb-2">Use Case 3: Design Approvals vs Construction Impact</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400 font-semibold">
                    <th className="pb-3">Design Package</th>
                    <th className="pb-3 text-right">Submitted Date</th>
                    <th className="pb-3 text-right">Review Due</th>
                    <th className="pb-3 text-center">Status</th>
                    <th className="pb-3 text-right">Approval Delay</th>
                    <th className="pb-3 pl-4">Construction Critical Path Impact</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {designPackages.map(dp => {
                    return (
                      <tr key={dp.id} className="hover:bg-slate-800/10">
                        <td className="py-2.5 font-semibold text-slate-100">{dp.name}</td>
                        <td className="py-2.5 text-right font-mono">{dp.submitted_date || '-'}</td>
                        <td className="py-2.5 text-right font-mono">{dp.review_due_date || '-'}</td>
                        <td className="py-2.5 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            dp.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400' :
                            dp.status === 'under_review' ? 'bg-purple-500/10 text-purple-400' :
                            'bg-slate-700/30 text-slate-400'
                          }`}>
                            {dp.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className={`py-2.5 text-right font-mono font-bold ${dp.delay_days > 0 ? 'text-red-400' : 'text-slate-400'}`}>
                          {dp.delay_days > 0 ? `+${dp.delay_days} days` : 'On Time'}
                        </td>
                        <td className="py-2.5 pl-4 text-slate-400">{dp.construction_impact || 'No impact recorded'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeCase === 'ipc' && (
          <div className="space-y-4">
            <h3 className="text-slate-200 text-sm font-semibold mb-2">Use Case 4: Earned Work done Value vs Certified IPC payments</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-b border-slate-700/30 pb-4 mb-4">
              <div className="bg-slate-900/40 p-4 border border-slate-800 rounded-lg space-y-2">
                <div className="text-[10px] uppercase font-bold text-slate-500">Physical Work Done Value (Earned)</div>
                <div className="text-2xl font-bold text-slate-100">NPR {(evm.earnedValue).toLocaleString()}</div>
                <div className="text-[9px] text-slate-400">Total contractual value of all quantities completed on-site.</div>
              </div>
              <div className="bg-slate-900/40 p-4 border border-slate-800 rounded-lg space-y-2">
                <div className="text-[10px] uppercase font-bold text-slate-500">Net Payment Received</div>
                <div className="text-2xl font-bold text-emerald-400">
                  NPR {(ipcSubmissions.filter(i => i.status === 'paid').reduce((sum, i) => sum + Number(i.paid_amount || i.certified_amount || 0), 0)).toLocaleString()}
                </div>
                <div className="text-[9px] text-slate-400">Total cash cleared in joint venture bank accounts.</div>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400 font-semibold">
                    <th className="pb-3">IPC No.</th>
                    <th className="pb-3 text-right">Claimed (NPR)</th>
                    <th className="pb-3 text-right">Certified (NPR)</th>
                    <th className="pb-3 text-right">Paid (NPR)</th>
                    <th className="pb-3 text-right">Retention (NPR)</th>
                    <th className="pb-3 text-right">Advance Recovery</th>
                    <th className="pb-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {ipcSubmissions.map(ipc => (
                    <tr key={ipc.id} className="hover:bg-slate-800/10">
                      <td className="py-2.5 font-bold">IPC #{ipc.ipc_number}</td>
                      <td className="py-2.5 text-right font-mono">{(ipc.claimed_amount).toLocaleString()}</td>
                      <td className="py-2.5 text-right font-mono">{(ipc.certified_amount).toLocaleString()}</td>
                      <td className="py-2.5 text-right font-mono">{(ipc.paid_amount).toLocaleString()}</td>
                      <td className="py-2.5 text-right font-mono">{(ipc.retention_deducted).toLocaleString()}</td>
                      <td className="py-2.5 text-right font-mono">{(ipc.advance_recovered).toLocaleString()}</td>
                      <td className="py-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          ipc.status === 'paid' ? 'bg-emerald-500/10 text-emerald-400' :
                          ipc.status === 'certified' ? 'bg-amber-500/10 text-amber-400 animate-pulse' :
                          'bg-red-500/10 text-red-400'
                        }`}>
                          {ipc.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
