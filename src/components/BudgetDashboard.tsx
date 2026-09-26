import React, { useEffect, useState } from 'react';
import { EVMMetrics } from '../lib/evm';
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

export default function BudgetDashboard({ projectId, budgetHeads, subcontractors, evm, onUpdateBudget, userRole }: BudgetDashboardProps) {
  const [selectedBdgId, setSelectedBdgId] = useState<string | null>(null);
  const [selectedBudget, setSelectedBudget] = useState<object | null>(null);
  const [editActualCost, setEditActualCost] = useState(0);
  const [cloudBudgetHeads, setCloudBudgetHeads] = useState<any[]>(budgetHeads);
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

  const handleStartEdit = (bh: any) => { setSelectedBdgId(bh.id); setEditActualCost(Number(bh.actual_cost) || 0); };
  const handleSaveEdit = async (bh: any) => {
    setSaveState('saving'); setMessage('');
    try {
      if (isSupabaseConfigured()) {
        const response = await fetch('/api/cost-control', { method: 'PATCH', headers: await headers(), body: JSON.stringify({ projectId, budgetHeadId: bh.id, actualCost: editActualCost }) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Actual cost could not be saved.');
        setCloudBudgetHeads(rows => rows.map(row => row.id === bh.id ? data.budgetHead : row));
      } else onUpdateBudget({ ...bh, actual_cost: editActualCost });
      setSelectedBdgId(null); setSaveState('idle'); setMessage('Actual cost saved.');
    } catch (error) {
      setSaveState('failed');
      setMessage(error instanceof Error ? error.message : 'Actual cost could not be saved. Retry when connected.');
    }
  };

  const totalContract = activeBudgetHeads.reduce((sum, b) => sum + Number(b.contract_value || 0), 0);
  const totalBudget = activeBudgetHeads.reduce((sum, b) => sum + Number(b.internal_budget || 0), 0);
  const totalActual = activeBudgetHeads.reduce((sum, b) => sum + Number(b.actual_cost || 0), 0);
  const totalCommitted = activeBudgetHeads.reduce((sum, b) => sum + Number(b.committed_cost || 0), 0);

  return <div className="space-y-6">
    {message && <div role="status" className={`rounded-lg border p-3 text-sm font-semibold ${saveState === 'failed' ? 'border-rose-200 bg-rose-50 text-rose-950' : 'border-blue-200 bg-blue-50 text-blue-950'}`}>{message}</div>}
    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
      <Metric label="Earned Value (EV)" value={evm.earnedValue} note="Work completed value at contract rates" />
      <Metric label="Actual Cost (AC)" value={totalActual} note="Approved cost-head actuals" tone="rose" />
      <Metric label="Forecast Final Cost" value={evm.forecastFinalCost} note="Current CPI-based forecast" tone="amber" />
      <Metric label="Expected Net Profit" value={totalContract - evm.forecastFinalCost} note="Contract value less forecast cost" tone="emerald" />
    </div>

    <section className="space-y-4 rounded-xl border border-slate-700/40 bg-slate-800/50 p-5 shadow-lg">
      <div><h2 className="text-sm font-semibold text-slate-200">Project Cost & Budget Breakdown</h2><p className="mt-1 text-xs text-slate-500">Server-confirmed project values. Scroll horizontally on small screens.</p></div>
      <div className="overflow-x-auto overscroll-x-contain rounded-lg border border-slate-200"><table className="w-full min-w-[1160px] table-fixed border-collapse text-left text-xs"><thead><tr className="border-b border-slate-700 font-semibold text-slate-400">{['BOQ Item','Budget Head Name','Contract Value','Internal Budget','Actual Cost','Committed','Forecast','Margin','Action'].map(h=><th key={h} className="p-3 text-right first:text-left first:w-28 [&:nth-child(2)]:text-left [&:nth-child(2)]:w-64">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-800 text-slate-300">{activeBudgetHeads.map(bh => {
          const actual = Number(bh.actual_cost || 0), contract = Number(bh.contract_value || 0), internal = Number(bh.internal_budget || 0);
          const cpi = actual > 0 ? (contract * 0.35) / actual : 1;
          const forecast = cpi > 0 ? internal / cpi : internal;
          const margin = contract - forecast;
          const isEditing = selectedBdgId === bh.id;
          return <tr key={bh.id} className="hover:bg-slate-800/10"><td className="p-3 font-mono text-slate-400">{bh.wbs_code}</td><td className="p-3 font-semibold text-slate-100">{bh.name}</td><td className="p-3 text-right font-mono">{contract.toLocaleString()}</td><td className="p-3 text-right font-mono">{internal.toLocaleString()}</td><td className="p-3 text-right font-mono">{isEditing?<input aria-label={`Actual cost for ${bh.name}`} type="number" min="0" value={editActualCost} onChange={e=>setEditActualCost(Number(e.target.value))} className="w-28 rounded border border-slate-700 bg-slate-900 px-1 text-right"/>:actual.toLocaleString()}</td><td className="p-3 text-right font-mono">{Number(bh.committed_cost || 0).toLocaleString()}</td><td className="p-3 text-right font-mono">{forecast.toLocaleString()}</td><td className={`p-3 text-right font-mono font-bold ${margin >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{margin.toLocaleString()}</td><td className="p-3 text-right"><div className="flex justify-end gap-2"><button onClick={()=>setSelectedBudget(bh)} className="font-semibold text-slate-100 hover:text-white">View details</button>{isEditable && (isEditing?<><button disabled={saveState==='saving'} onClick={()=>void handleSaveEdit(bh)} className="font-semibold text-emerald-400 disabled:opacity-60">{saveState==='saving'?'Saving…':'Save'}</button><button onClick={()=>setSelectedBdgId(null)} className="font-semibold text-slate-400">Cancel</button></>:<button onClick={()=>handleStartEdit(bh)} className="font-semibold text-blue-400">Edit cost</button>)}</div></td></tr>;
        })}<tr className="border-t border-slate-700 bg-slate-900/35 font-bold"><td className="p-3"></td><td className="p-3 text-slate-200">TOTAL</td><td className="p-3 text-right font-mono">{totalContract.toLocaleString()}</td><td className="p-3 text-right font-mono">{totalBudget.toLocaleString()}</td><td className="p-3 text-right font-mono text-rose-400">{totalActual.toLocaleString()}</td><td className="p-3 text-right font-mono">{totalCommitted.toLocaleString()}</td><td className="p-3 text-right font-mono text-amber-400">{evm.forecastFinalCost.toLocaleString()}</td><td className={`p-3 text-right font-mono ${totalContract-evm.forecastFinalCost >= 0?'text-emerald-400':'text-rose-400'}`}>{(totalContract-evm.forecastFinalCost).toLocaleString()}</td><td/></tr></tbody>
      </table></div>
    </section>

    <section className="space-y-3 rounded-xl border border-slate-700/40 bg-slate-800/50 p-5 shadow-lg"><h2 className="text-sm font-semibold text-slate-200">Subcontractor Packages Execution</h2><div className="grid grid-cols-1 gap-4 md:grid-cols-2">{subcontractors.map(sub=>{const margin=Number(sub.contract_value||0)-Number(sub.actual_cost||0);return <div key={sub.id} className="rounded-xl border border-slate-700 bg-slate-900/10 p-4"><div className="flex justify-between"><div><h3 className="text-xs font-semibold text-slate-200">{sub.subcontractor_name}</h3><p className="text-[10px] text-slate-500">{sub.package_name}</p></div><span className="text-[10px] font-bold text-blue-400">Progress: {sub.progress_percentage}%</span></div><div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-800/50 pt-2 text-[10px]"><Value label="Contract" value={sub.contract_value}/><Value label="Paid / Cost" value={sub.actual_cost}/><Value label="Sub Margin" value={margin} tone="emerald"/></div></div>})}</div></section>
    <RecordDetailsDialog title="Cost control budget head" record={selectedBudget} onClose={()=>setSelectedBudget(null)} />
  </div>;
}

function Metric({ label, value, note, tone = 'slate' }: { label: string; value: number; note: string; tone?: 'slate'|'rose'|'amber'|'emerald' }) { const colors={slate:'text-slate-100',rose:'text-rose-400',amber:'text-amber-400',emerald:'text-emerald-400'}; return <div className="rounded-xl border border-slate-700/40 bg-slate-800/50 p-4 shadow-lg"><div className="text-xs font-semibold uppercase text-slate-400">{label}</div><div className={`mt-1 text-xl font-bold ${colors[tone]}`}>NPR {(value / 1_000_000).toFixed(2)}M</div><div className="mt-2 text-[9px] text-slate-500">{note}</div></div>; }
function Value({label,value,tone='slate'}:{label:string;value:number;tone?:'slate'|'emerald'}) { return <div><span className="block uppercase text-slate-500">{label}</span><span className={`font-mono font-semibold ${tone==='emerald'?'text-emerald-400':'text-slate-300'}`}>NPR {Number(value||0).toLocaleString()}</span></div>; }
