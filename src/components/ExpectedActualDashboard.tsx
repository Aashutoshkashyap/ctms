// Expected vs Actual Progress Dashboard (Page 3)
import React, { useState } from 'react';
import { Activity } from '../lib/cpm';
import { EVMMetrics } from '../lib/evm';
import { formatBsDate } from '../lib/nepaliDate';
import { activityActualProgress, activityPlannedProgress, calculateProjectFinancials } from '../lib/projectMetrics';

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

  const ipcFinancials = calculateProjectFinancials({ ipcSubmissions });

  return (
    <div className="space-y-6">
      {/* Header and Use Case Tabs Selection */}
      <div className="bg-white p-5 border border-slate-200/90 rounded-2xl shadow-xs space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 text-sm">📊</span>
            <h2 className="text-slate-900 text-base font-bold">Expected vs Actual Performance</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Compare physical activity progress, cost variances, design approvals, and IPC certifications against project baselines.
          </p>
        </div>

        <div className="flex flex-wrap bg-slate-100 p-1 rounded-xl border border-slate-200/80 w-fit text-xs gap-1">
          <button 
            onClick={() => setActiveCase('progress')}
            className={`px-3.5 py-2 text-center rounded-lg font-semibold transition flex items-center gap-1.5 ${
              activeCase === 'progress' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <span>📈</span> Activity Progress
          </button>
          <button 
            onClick={() => setActiveCase('cost')}
            className={`px-3.5 py-2 text-center rounded-lg font-semibold transition flex items-center gap-1.5 ${
              activeCase === 'cost' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <span>💰</span> Cost Variance
          </button>
          <button 
            onClick={() => setActiveCase('design')}
            className={`px-3.5 py-2 text-center rounded-lg font-semibold transition flex items-center gap-1.5 ${
              activeCase === 'design' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <span>📐</span> Design Approvals
          </button>
          <button 
            onClick={() => setActiveCase('ipc')}
            className={`px-3.5 py-2 text-center rounded-lg font-semibold transition flex items-center gap-1.5 ${
              activeCase === 'ipc' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <span>📄</span> IPC Billing
          </button>
        </div>
      </div>

      {/* Grid Content based on Selection */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs">
        {activeCase === 'progress' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-slate-900 text-base font-bold">Physical Activity Progress Deviations</h3>
                <p className="text-xs text-slate-500">Planned vs actual progress as of {formatBsDate(currentDate)} with root-cause remarks and active mitigations.</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 font-semibold">
                    <th className="py-2.5 px-3">BOQ Item</th>
                    <th className="py-2.5 px-3">Description of Work</th>
                    <th className="py-2.5 px-3 text-right">Planned %</th>
                    <th className="py-2.5 px-3 text-right">Actual %</th>
                    <th className="py-2.5 px-3 text-right">Variance</th>
                    <th className="py-2.5 px-3">Primary Delay Reason</th>
                    <th className="py-2.5 px-3">Mitigation / Corrective Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {activities.map(act => {
                    const planned = activityPlannedProgress(act, currentDate);
                    const actual = activityActualProgress(act);
                    const variance = actual - planned;
                    
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
                      <tr key={act.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-2.5 px-3 font-mono font-medium text-slate-600">{act.wbs_code}</td>
                        <td className="py-2.5 px-3 font-semibold text-slate-900">{act.name}</td>
                        <td className="py-2.5 px-3 text-right font-medium text-slate-600">{planned.toFixed(0)}%</td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900">{actual.toFixed(0)}%</td>
                        <td className="py-2.5 px-3 text-right">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            variance >= 0 
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}>
                            {variance >= 0 ? '+' : ''}{variance.toFixed(0)}%
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 max-w-[200px]">{reason}</td>
                        <td className="py-2.5 px-3 font-medium text-blue-700 max-w-[240px]">{action}</td>
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
            <div>
              <h3 className="text-slate-900 text-base font-bold">Budget vs Actual Cost Variances</h3>
              <p className="text-xs text-slate-500">Commercial comparison of contract value, approved internal budget, and posted costs.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 font-semibold">
                    <th className="py-2.5 px-3">BOQ Item</th>
                    <th className="py-2.5 px-3">Budget Head Name</th>
                    <th className="py-2.5 px-3 text-right">Contract Value (NPR)</th>
                    <th className="py-2.5 px-3 text-right">Internal Budget (NPR)</th>
                    <th className="py-2.5 px-3 text-right">Actual Cost (NPR)</th>
                    <th className="py-2.5 px-3 text-right">Cost Variance</th>
                    <th className="py-2.5 px-3">Cost Overrun Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {budgetHeads.map(bh => {
                    const variance = bh.internal_budget - bh.actual_cost;
                    let reason = 'Under budget / On Track';
                    if (bh.actual_cost > bh.internal_budget) {
                      reason = bh.wbs_code === '01' 
                        ? 'Steel reinforcement design updates forced structural engineering re-work'
                        : 'Subcontractor rates adjusted for bulk material inflation';
                    }

                    return (
                      <tr key={bh.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-2.5 px-3 font-mono font-medium text-slate-600">{bh.wbs_code}</td>
                        <td className="py-2.5 px-3 font-semibold text-slate-900">{bh.name}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-600">{(bh.contract_value).toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-600">{(bh.internal_budget).toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-medium text-slate-900">{(bh.actual_cost).toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            variance >= 0 
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}>
                            {variance >= 0 ? 'Savings: +' : 'Deficit: '}{(variance).toLocaleString()}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 max-w-[240px]">{reason}</td>
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
            <div>
              <h3 className="text-slate-900 text-base font-bold">Design Approvals vs Construction Impact</h3>
              <p className="text-xs text-slate-500">Tracking design submissions, review SLAs with Employer/Consultant, and schedule impact.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 font-semibold">
                    <th className="py-2.5 px-3">Design Package</th>
                    <th className="py-2.5 px-3 text-right">Submitted Date (BS)</th>
                    <th className="py-2.5 px-3 text-right">Review Due (BS)</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3 text-right">Approval Delay</th>
                    <th className="py-2.5 px-3">Construction Critical Path Impact</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {designPackages.map(dp => {
                    let statusClass = 'status-pill-neutral';
                    let statusText = 'PENDING';
                    if (dp.status === 'approved') {
                      statusClass = 'status-pill-completed';
                      statusText = 'APPROVED';
                    } else if (dp.status === 'under_review') {
                      statusClass = 'status-pill-progress';
                      statusText = 'UNDER REVIEW';
                    }

                    return (
                      <tr key={dp.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-2.5 px-3 font-semibold text-slate-900">{dp.name}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-600">{formatBsDate(dp.submitted_date)}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-600">{formatBsDate(dp.review_due_date)}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`status-pill ${statusClass}`}>
                            <span className="status-pill-dot" />
                            {statusText}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            dp.delay_days > 0 
                              ? 'bg-rose-50 text-rose-700 border border-rose-200' 
                              : 'text-slate-600 bg-slate-100'
                          }`}>
                            {dp.delay_days > 0 ? `+${dp.delay_days} days` : 'On Time'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 max-w-[260px]">{dp.construction_impact || 'No impact recorded'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeCase === 'ipc' && (
          <div className="space-y-5">
            <div>
              <h3 className="text-slate-900 text-base font-bold">Earned Work done Value vs Certified IPC payments</h3>
              <p className="text-xs text-slate-500">Reconciliation between earned physical quantities, certified valuation, and joint-venture bank clearances.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-50/80 p-4 border border-slate-200/90 rounded-xl space-y-1">
                <div className="text-[11px] uppercase font-bold text-slate-500">Physical Work Done Value (Earned)</div>
                <div className="text-2xl font-extrabold text-slate-900">NPR {(evm.earnedValue).toLocaleString()}</div>
                <div className="text-xs text-slate-500">Total contractual value of all physical quantities completed on-site.</div>
              </div>
              <div className="bg-emerald-50/60 p-4 border border-emerald-200 rounded-xl space-y-1">
                <div className="text-[11px] uppercase font-bold text-emerald-700">Net Payment Received</div>
                <div className="text-2xl font-extrabold text-emerald-800">
                  NPR {ipcFinancials.paidAmount.toLocaleString()}
                </div>
                <div className="text-xs text-emerald-700">Total cash cleared in joint venture bank accounts.</div>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 font-semibold">
                    <th className="py-2.5 px-3">IPC No.</th>
                    <th className="py-2.5 px-3 text-right">Claimed (NPR)</th>
                    <th className="py-2.5 px-3 text-right">Certified (NPR)</th>
                    <th className="py-2.5 px-3 text-right">Paid (NPR)</th>
                    <th className="py-2.5 px-3 text-right">Retention (NPR)</th>
                    <th className="py-2.5 px-3 text-right">Advance Recovery</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {ipcSubmissions.map(ipc => {
                    let statusClass = 'status-pill-neutral';
                    let statusText = ipc.status?.toUpperCase() || 'PENDING';
                    if (ipc.status === 'paid') {
                      statusClass = 'status-pill-completed';
                      statusText = 'PAID';
                    } else if (ipc.status === 'certified') {
                      statusClass = 'status-pill-progress';
                      statusText = 'CERTIFIED';
                    } else if (ipc.status === 'pending') {
                      statusClass = 'status-pill-pending';
                      statusText = 'PENDING';
                    }

                    return (
                      <tr key={ipc.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-2.5 px-3 font-bold text-slate-900">IPC #{ipc.ipc_number}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-700">{(ipc.claimed_amount).toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-medium text-slate-900">{(ipc.certified_amount).toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">{(ipc.paid_amount).toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-600">{(ipc.retention_deducted).toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-600">{(ipc.advance_recovered).toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`status-pill ${statusClass}`}>
                            <span className="status-pill-dot" />
                            {statusText}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
