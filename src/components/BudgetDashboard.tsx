// Budget and Cost Dashboard Component (Page 6)
import React, { useEffect, useState } from 'react';
import { EVMMetrics } from '../lib/evm';
import { sumBudgetValues } from '../lib/projectMetrics';
import { isSupabaseConfigured, storage } from '../lib/storage';
import RecordDetailsDialog from './RecordDetailsDialog';

interface BudgetDashboardProps {
  projectId: string;
  budgetHeads: any[];
  subcontractors: any[];
  evm: EVMMetrics;
  onUpdateBudget: (budget: any) => void;
  userRole: string;
}

export default function BudgetDashboard({
  projectId,
  budgetHeads,
  subcontractors,
  evm,
  onUpdateBudget,
  userRole
}: BudgetDashboardProps) {
  const [cloudBudgetHeads, setCloudBudgetHeads] = useState<any[]>([]);
  const [selectedBdgId, setSelectedBdgId] = useState<string | null>(null);
  const [editActualCost, setEditActualCost] = useState(0);
  const [selectedBudget, setSelectedBudget] = useState<any | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'failed'>('idle');
  const [message, setMessage] = useState('');

  const activeBudgetHeads = isSupabaseConfigured() ? cloudBudgetHeads : budgetHeads;
  const isEditable = ['project_director', 'project_manager', 'accountant', 'qs_billing_engineer'].includes(userRole);
  const headers = async () => ({ Authorization: `Bearer ${(await storage.getAuthSession())?.access_token || ''}`, 'Content-Type': 'application/json' });

  useEffect(() => {
    let current = true;
    void (async () => {
      if (!isSupabaseConfigured()) return;
      setMessage('');
      const response = await fetch(`/api/cost-control?projectId=${encodeURIComponent(projectId)}`, { headers: await headers(), cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!current) return;
      if (response.ok) setCloudBudgetHeads(data.budgetHeads || []);
      else if (response.status !== 401) setMessage(data.error || 'Cost control records are unavailable.');
    })();
    return () => { current = false; };
  }, [projectId]);

  const handleStartEdit = (bh: any) => {
    setSelectedBdgId(bh.id);
    setEditActualCost(Number(bh.actual_cost) || 0);
  };

  const handleSaveEdit = async (bh: any) => {
    setSaveState('saving');
    setMessage('');
    try {
      if (isSupabaseConfigured()) {
        const response = await fetch('/api/cost-control', {
          method: 'PATCH',
          headers: await headers(),
          body: JSON.stringify({ projectId, budgetHeadId: bh.id, actualCost: editActualCost })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Actual cost could not be saved.');
        setCloudBudgetHeads(rows => rows.map(row => row.id === bh.id ? data.budgetHead : row));
      } else {
        onUpdateBudget({
          ...bh,
          actual_cost: editActualCost
        });
      }
      setSelectedBdgId(null);
      setSaveState('idle');
      setMessage('Actual cost saved.');
    } catch (error) {
      setSaveState('failed');
      setMessage(error instanceof Error ? error.message : 'Actual cost could not be saved. Retry when connected.');
    }
  };

  const displayedBudgetHeads = activeBudgetHeads.length ? activeBudgetHeads : budgetHeads;
  const budgetTotals = sumBudgetValues(displayedBudgetHeads);
  const { contractValue: totalContract, internalBudget: totalBudget, actualCost: totalActual, committedCost: totalCommitted } = budgetTotals;

  return (
    <div className="space-y-6">
      {/* Financial Health Indicators */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200/90 p-5 rounded-2xl shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Earned Value (EV)</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 text-sm">📈</span>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 font-mono">NPR {(evm.earnedValue / 1000000).toFixed(2)}M</div>
          <div className="text-[11px] text-slate-500">Work completed value at contract rates</div>
        </div>

        <div className="bg-white border border-slate-200/90 p-5 rounded-2xl shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Actual Cost (AC)</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600 text-sm">💸</span>
          </div>
          <div className="text-2xl font-extrabold text-rose-600 font-mono">NPR {(totalActual / 1000000).toFixed(2)}M</div>
          <div className="text-[11px] text-slate-500">Incurred costs across all project heads</div>
        </div>

        <div className="bg-white border border-slate-200/90 p-5 rounded-2xl shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider">EAC (Forecast Cost)</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600 text-sm">🔮</span>
          </div>
          <div className="text-2xl font-extrabold text-amber-600 font-mono">NPR {(evm.forecastFinalCost / 1000000).toFixed(2)}M</div>
          <div className="text-[11px] text-slate-500">Projected total cost based on current CPI</div>
        </div>

        <div className="bg-white border border-slate-200/90 p-5 rounded-2xl shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Expected Net Margin</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 text-sm">💰</span>
          </div>
          <div className="text-2xl font-extrabold text-emerald-600 font-mono">NPR {((totalContract - evm.forecastFinalCost) / 1000000).toFixed(2)}M</div>
          <div className="text-[11px] text-slate-500">Contract Value minus Forecast Final Cost</div>
        </div>
      </div>

      {/* Budget Heads list */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-slate-900 text-sm font-bold">Project Cost & Budget Breakdown</h3>
            <p className="mt-1 text-xs text-slate-500">Amounts are in NPR. Compare contractual baseline, internal budget, committed funds, and actual costs.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {budgetHeads.length} Heads
          </span>
        </div>

        <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-slate-200">
          <table className="budget-table w-full min-w-[1180px] table-fixed text-left border-collapse text-xs">
            <colgroup><col className="w-24"/><col className="w-64"/><col className="w-36"/><col className="w-36"/><col className="w-36"/><col className="w-36"/><col className="w-36"/><col className="w-36"/>{isEditable&&<col className="w-24"/>}</colgroup>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 font-semibold">
                <th className="py-3 px-3">BOQ Item</th>
                <th className="py-3 px-3">Budget Head Name</th>
                <th className="py-3 px-3 text-right">Contract Value</th>
                <th className="py-3 px-3 text-right">Internal Budget</th>
                <th className="py-3 px-3 text-right">Actual Cost</th>
                <th className="py-3 px-3 text-right">Committed</th>
                <th className="py-3 px-3 text-right">Forecast</th>
                <th className="py-3 px-3 text-right">Margin</th>
                <th className="py-3 px-3 text-right pr-4">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {displayedBudgetHeads.map(bh => {
                const cpi = bh.actual_cost > 0 ? (bh.contract_value * 0.35) / bh.actual_cost : 1; // Simplified item CPI
                const forecast = cpi > 0 ? bh.internal_budget / cpi : bh.internal_budget;
                const margin = bh.contract_value - forecast;

                const isEditing = selectedBdgId === bh.id;

                return (
                  <tr key={bh.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-3 font-mono font-medium text-slate-500">{bh.wbs_code}</td>
                    <td className="py-3 px-3 font-semibold text-slate-900">{bh.name}</td>
                    <td className="py-3 px-3 text-right font-mono text-slate-800">{(bh.contract_value).toLocaleString()}</td>
                    <td className="py-3 px-3 text-right font-mono text-slate-800">{(bh.internal_budget).toLocaleString()}</td>
                    <td className="py-3 px-3 text-right font-mono">
                      {isEditing ? (
                        <input
                          type="number"
                          value={editActualCost}
                          onChange={(e) => setEditActualCost(Number(e.target.value))}
                          className="w-24 bg-white border border-blue-500 rounded-lg text-right px-2 py-1 text-slate-900 outline-none"
                        />
                      ) : (
                        <span className="text-rose-600 font-semibold">{(bh.actual_cost).toLocaleString()}</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-700">{(bh.committed_cost).toLocaleString()}</td>
                    <td className="py-3 px-3 text-right font-mono text-slate-800">{(forecast).toLocaleString()}</td>
                    <td className={`py-3 px-3 text-right font-mono font-bold ${margin >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {(margin).toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-right pr-4">
                      <div className="flex justify-end gap-2 items-center">
                        <button type="button" onClick={() => setSelectedBudget(bh)} className="font-semibold text-blue-600 hover:text-blue-800 text-xs">View details</button>
                        {isEditable && (
                          isEditing ? (
                            <div className="flex justify-end gap-1.5 font-bold">
                              <button type="button" disabled={saveState === 'saving'} onClick={() => void handleSaveEdit(bh)} className="text-emerald-700 hover:text-emerald-800 text-xs disabled:opacity-60">{saveState === 'saving' ? 'Saving…' : 'Save'}</button>
                              <button type="button" onClick={() => setSelectedBdgId(null)} className="text-slate-500 hover:text-slate-700 text-xs">Cancel</button>
                            </div>
                          ) : (
                            <button type="button" onClick={() => handleStartEdit(bh)} className="text-slate-600 hover:text-slate-900 font-semibold text-xs">Edit cost</button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {/* Totals Row */}
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
                <td className="py-3 px-3"></td>
                <td className="py-3 px-3 text-slate-900 uppercase tracking-wider text-[11px]">Total Portfolio</td>
                <td className="py-3 px-3 text-right font-mono text-slate-900">{(totalContract).toLocaleString()}</td>
                <td className="py-3 px-3 text-right font-mono text-slate-900">{(totalBudget).toLocaleString()}</td>
                <td className="py-3 px-3 text-right font-mono text-rose-600">{(totalActual).toLocaleString()}</td>
                <td className="py-3 px-3 text-right font-mono text-slate-900">{(totalCommitted).toLocaleString()}</td>
                <td className="py-3 px-3 text-right font-mono text-amber-600">{(evm.forecastFinalCost).toLocaleString()}</td>
                <td className={`py-3 px-3 text-right font-mono ${totalContract - evm.forecastFinalCost >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {(totalContract - evm.forecastFinalCost).toLocaleString()}
                </td>
                {isEditable && <td className="px-3"></td>}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Subcontractor tracking */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 text-sm">🤝</span>
            <div>
              <h3 className="text-slate-900 text-sm font-bold">Subcontractor Packages Execution</h3>
              <p className="text-xs text-slate-500">Contract milestones, disbursements and contractor profit margins.</p>
            </div>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {subcontractors.length} Subcontractors
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {subcontractors.map(sub => {
            const margin = sub.contract_value - sub.actual_cost;
            return (
              <div key={sub.id} className="border border-slate-200 bg-slate-50/60 p-4 rounded-xl flex flex-col space-y-2.5">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-slate-900 font-bold text-xs">{sub.subcontractor_name}</h4>
                    <span className="text-[11px] text-slate-500">{sub.package_name}</span>
                  </div>
                  <span className="text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">
                    Progress: {sub.progress_percentage}%
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 border-t border-slate-200/80 pt-2 text-[11px]">
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-semibold">Contract</span>
                    <span className="font-semibold text-slate-800 font-mono">NPR {sub.contract_value.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-semibold">Paid / Cost</span>
                    <span className="font-semibold text-rose-600 font-mono">NPR {sub.actual_cost.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-semibold">Sub Margin</span>
                    <span className="font-semibold text-emerald-600 font-mono">NPR {margin.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <RecordDetailsDialog title="Cost control budget head" record={selectedBudget} onClose={() => setSelectedBudget(null)} />
    </div>
  );
}
