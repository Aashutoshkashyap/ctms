// Budget and Cost Dashboard Component (Page 6)
import React, { useState } from 'react';
import { EVMMetrics } from '../lib/evm';

interface BudgetDashboardProps {
  budgetHeads: any[];
  subcontractors: any[];
  evm: EVMMetrics;
  onUpdateBudget: (budget: any) => void;
  userRole: string;
}

export default function BudgetDashboard({
  budgetHeads,
  subcontractors,
  evm,
  onUpdateBudget,
  userRole
}: BudgetDashboardProps) {
  const [selectedBdgId, setSelectedBdgId] = useState<string | null>(null);
  const [editActualCost, setEditActualCost] = useState(0);

  const selectedBdg = budgetHeads.find(b => b.id === selectedBdgId);
  const isEditable = ['super_admin', 'project_manager', 'accountant', 'qs_billing_engineer'].includes(userRole);

  const handleStartEdit = (bh: any) => {
    setSelectedBdgId(bh.id);
    setEditActualCost(bh.actual_cost);
  };

  const handleSaveEdit = (bh: any) => {
    onUpdateBudget({
      ...bh,
      actual_cost: editActualCost
    });
    setSelectedBdgId(null);
    alert('Actual cost updated successfully.');
  };

  const totalContract = budgetHeads.reduce((sum, b) => sum + Number(b.contract_value), 0);
  const totalBudget = budgetHeads.reduce((sum, b) => sum + Number(b.internal_budget), 0);
  const totalActual = budgetHeads.reduce((sum, b) => sum + Number(b.actual_cost), 0);
  const totalCommitted = budgetHeads.reduce((sum, b) => sum + Number(b.committed_cost), 0);

  return (
    <div className="space-y-6">
      {/* Financial Health Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-800/50 border border-slate-700/40 p-4 rounded-xl shadow-lg">
          <div className="text-slate-400 text-xs font-semibold uppercase">Earned Value (EV)</div>
          <div className="text-xl font-bold mt-1 text-slate-100">NPR {(evm.earnedValue / 1000000).toFixed(2)}M</div>
          <div className="text-[9px] text-slate-500 mt-2">Work completed value at contract rates</div>
        </div>

        <div className="bg-slate-800/50 border border-slate-700/40 p-4 rounded-xl shadow-lg">
          <div className="text-slate-400 text-xs font-semibold uppercase">Actual Cost (AC)</div>
          <div className="text-xl font-bold mt-1 text-rose-400">NPR {(totalActual / 1000000).toFixed(2)}M</div>
          <div className="text-[9px] text-slate-500 mt-2">Sum of cash expenses logged at site</div>
        </div>

        <div className="bg-slate-800/50 border border-slate-700/40 p-4 rounded-xl shadow-lg">
          <div className="text-slate-400 text-xs font-semibold uppercase">EAC (Forecast Final Cost)</div>
          <div className="text-xl font-bold mt-1 text-amber-400">NPR {(evm.forecastFinalCost / 1000000).toFixed(2)}M</div>
          <div className="text-[9px] text-slate-500 mt-2">Projected total cost based on current CPI</div>
        </div>

        <div className="bg-slate-800/50 border border-slate-700/40 p-4 rounded-xl shadow-lg">
          <div className="text-slate-400 text-xs font-semibold uppercase">Expected Net Profit</div>
          <div className="text-xl font-bold mt-1 text-emerald-400">NPR {((totalContract - evm.forecastFinalCost) / 1000000).toFixed(2)}M</div>
          <div className="text-[9px] text-slate-500 mt-2">Contract Value minus Forecast Final Cost</div>
        </div>
      </div>

      {/* Budget Heads list */}
      <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-5 shadow-lg space-y-4">
        <h3 className="text-slate-200 text-sm font-semibold">Project Cost & Budget Breakdown</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400 font-semibold">
                <th className="pb-3">WBS</th>
                <th className="pb-3">Budget Head Name</th>
                <th className="pb-3 text-right">Contract Value</th>
                <th className="pb-3 text-right">Internal Budget</th>
                <th className="pb-3 text-right">Actual Cost</th>
                <th className="pb-3 text-right">Committed Cost</th>
                <th className="pb-3 text-right">Forecast Cost</th>
                <th className="pb-3 text-right">Projected Margin</th>
                {isEditable && <th className="pb-3 text-right pr-2">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {budgetHeads.map(bh => {
                const cpi = bh.actual_cost > 0 ? (bh.contract_value * 0.35) / bh.actual_cost : 1; // Simplified item CPI
                const forecast = cpi > 0 ? bh.internal_budget / cpi : bh.internal_budget;
                const margin = bh.contract_value - forecast;

                const isEditing = selectedBdgId === bh.id;

                return (
                  <tr key={bh.id} className="hover:bg-slate-800/10">
                    <td className="py-3 font-mono text-slate-400">{bh.wbs_code}</td>
                    <td className="py-3 font-semibold text-slate-100">{bh.name}</td>
                    <td className="py-3 text-right font-mono">{(bh.contract_value).toLocaleString()}</td>
                    <td className="py-3 text-right font-mono">{(bh.internal_budget).toLocaleString()}</td>
                    <td className="py-3 text-right font-mono">
                      {isEditing ? (
                        <input
                          type="number"
                          value={editActualCost}
                          onChange={(e) => setEditActualCost(Number(e.target.value))}
                          className="w-24 bg-slate-900 border border-slate-700 rounded text-right px-1"
                        />
                      ) : (
                        (bh.actual_cost).toLocaleString()
                      )}
                    </td>
                    <td className="py-3 text-right font-mono">{(bh.committed_cost).toLocaleString()}</td>
                    <td className="py-3 text-right font-mono">{(forecast).toLocaleString()}</td>
                    <td className={`py-3 text-right font-mono font-bold ${margin >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {(margin).toLocaleString()}
                    </td>
                    {isEditable && (
                      <td className="py-3 text-right pr-2">
                        {isEditing ? (
                          <div className="flex justify-end gap-1 font-bold">
                            <button onClick={() => handleSaveEdit(bh)} className="text-emerald-400 hover:text-emerald-300">Save</button>
                            <button onClick={() => setSelectedBdgId(null)} className="text-slate-400 hover:text-slate-300">Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => handleStartEdit(bh)} className="text-blue-400 hover:text-blue-300 font-semibold">Log Exp</button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
              {/* Totals Row */}
              <tr className="border-t border-slate-700 bg-slate-900/35 font-bold">
                <td className="py-3"></td>
                <td className="py-3 text-slate-200">TOTAL</td>
                <td className="py-3 text-right font-mono text-slate-200">{(totalContract).toLocaleString()}</td>
                <td className="py-3 text-right font-mono text-slate-200">{(totalBudget).toLocaleString()}</td>
                <td className="py-3 text-right font-mono text-rose-400">{(totalActual).toLocaleString()}</td>
                <td className="py-3 text-right font-mono text-slate-200">{(totalCommitted).toLocaleString()}</td>
                <td className="py-3 text-right font-mono text-amber-400">{(evm.forecastFinalCost).toLocaleString()}</td>
                <td className={`py-3 text-right font-mono ${totalContract - evm.forecastFinalCost >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {(totalContract - evm.forecastFinalCost).toLocaleString()}
                </td>
                {isEditable && <td></td>}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Subcontractor tracking */}
      <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-5 shadow-lg space-y-3">
        <h3 className="text-slate-200 text-sm font-semibold">Subcontractor Packages Execution</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {subcontractors.map(sub => {
            const margin = sub.contract_value - sub.actual_cost;
            return (
              <div key={sub.id} className="border border-slate-700 bg-slate-900/10 p-4 rounded-xl flex flex-col space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-slate-200 font-semibold text-xs">{sub.subcontractor_name}</h4>
                    <span className="text-[10px] text-slate-500">{sub.package_name}</span>
                  </div>
                  <span className="text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded">
                    Progress: {sub.progress_percentage}%
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 border-t border-slate-800/50 pt-2 text-[10px]">
                  <div>
                    <span className="text-slate-500 block uppercase">Contract</span>
                    <span className="font-semibold text-slate-300 font-mono">NPR {sub.contract_value.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block uppercase">Paid / Cost</span>
                    <span className="font-semibold text-slate-300 font-mono">NPR {sub.actual_cost.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block uppercase">Sub Margin</span>
                    <span className="font-semibold text-emerald-400 font-mono">NPR {margin.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
