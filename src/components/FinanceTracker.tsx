// Causal-Style Financial Tracker and Spreadsheet Component
import React, { useState, useMemo, useEffect } from 'react';
import { storage, FinanceRow } from '../lib/storage';

const DEFAULT_FINANCE_ROWS: FinanceRow[] = [
    {
      id: 'fin-revenue-ipc',
      name: 'Contract IPC Billings',
      category: 'revenue',
      values: [28000000, 32000000, 41000000, 38000000, 45000000, 48000000]
    },
    {
      id: 'fin-revenue-variations',
      name: 'Variation Claims Confirmed',
      category: 'revenue',
      values: [0, 1200000, 0, 3500000, 0, 1800000]
    },
    {
      id: 'fin-cogs-subcontractors',
      name: 'Subcontractor Certificates',
      category: 'cogs',
      values: [12000000, 15000000, 18000000, 16000000, 22000000, 24000000]
    },
    {
      id: 'fin-cogs-materials',
      name: 'Material Logistics & Fuel',
      category: 'cogs',
      values: [6000000, 7500000, 9000000, 8500000, 10500000, 11000000]
    },
    {
      id: 'fin-cogs-equipment',
      name: 'Equipment Hire & Maintenance',
      category: 'cogs',
      values: [3000000, 3200000, 4500000, 4000000, 5000000, 5500000]
    },
    {
      id: 'fin-opex-camp',
      name: 'Camps & Site Overheads',
      category: 'opex',
      values: [1500000, 1500000, 1600000, 1600000, 1800000, 1800000]
    },
    {
      id: 'fin-opex-hq',
      name: 'Kathmandu HQ Overhead Allocation',
      category: 'opex',
      values: [1000000, 1000000, 1000000, 1000000, 1000000, 1000000]
    },
    {
      id: 'fin-opex-ehs',
      name: 'EHS & Quality testing kits',
      category: 'opex',
      values: [500000, 600000, 450000, 800000, 550000, 900000]
    }
];

export default function FinanceTracker({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<FinanceRow[]>(() => {
    const saved = storage.getFinanceRows();
    return saved.length > 0 ? saved : DEFAULT_FINANCE_ROWS;
  });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    revenue: true,
    cogs: true,
    opex: true,
    outputs: true,
  });

  const [forecastMultiplier, setForecastMultiplier] = useState(1.0); // 100%
  const months = ['Jan 26', 'Feb 26', 'Mar 26', 'Apr 26', 'May 26', 'Jun 26'];

  useEffect(() => {
    storage.saveFinanceRows(rows);
  }, [rows, projectId]);

  const toggleSection = (section: string) => {
    setExpanded(current => ({ ...current, [section]: !current[section] }));
  };

  // Handle cell edits
  const handleCellChange = (rowIndex: number, colIndex: number, valStr: string) => {
    const val = parseFloat(valStr.replace(/,/g, '')) || 0;
    setRows(prev => {
      const next = [...prev];
      const newValues = [...next[rowIndex].values];
      newValues[colIndex] = val;
      next[rowIndex] = { ...next[rowIndex], values: newValues };
      return next;
    });
  };

  // Perform sheet calculations
  const summary = useMemo(() => {
    const revenueRow = Array(6).fill(0);
    const cogsRow = Array(6).fill(0);
    const opexRow = Array(6).fill(0);

    rows.forEach(r => {
      r.values.forEach((v, idx) => {
        // Apply forecastMultiplier only to COGS and OPEX to simulate sensitivity analysis
        const mult = (r.category === 'cogs' || r.category === 'opex') ? forecastMultiplier : 1;
        const finalVal = v * mult;
        
        if (r.category === 'revenue') revenueRow[idx] += finalVal;
        if (r.category === 'cogs') cogsRow[idx] += finalVal;
        if (r.category === 'opex') opexRow[idx] += finalVal;
      });
    });

    const netCashFlow = revenueRow.map((rev, idx) => rev - (cogsRow[idx] + opexRow[idx]));
    
    const cumulativeCash: number[] = [];
    let runningSum = 15000000; // Starting cash reserve (NPR 15M)
    netCashFlow.forEach(net => {
      runningSum += net;
      cumulativeCash.push(runningSum);
    });

    return {
      totalRevenue: revenueRow,
      totalCogs: cogsRow,
      totalOpex: opexRow,
      netCashFlow,
      cumulativeCash
    };
  }, [rows, forecastMultiplier]);

  // Generate SVG mini sparkline path
  const getSparklinePath = (values: number[]) => {
    if (values.length < 2) return '';
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const width = 60;
    const height = 16;
    
    return values.map((val, idx) => {
      const x = (idx / (values.length - 1)) * width;
      const y = height - ((val - min) / range) * height + 2; // pad 2px
      return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
  };

  // Calculate scales for the cumulative cash balance chart
  const chartPoints = useMemo(() => {
    const vals = summary.cumulativeCash;
    const min = Math.min(...vals, 0);
    const max = Math.max(...vals);
    const range = max - min || 1;
    const w = 600;
    const h = 180;

    const points = vals.map((val, idx) => {
      const x = (idx / (vals.length - 1)) * w;
      const y = h - ((val - min) / range) * h;
      return { x, y, value: val };
    });

    const baselineY = h - ((0 - min) / range) * h;

    return { points, w, h, baselineY, min, max };
  }, [summary.cumulativeCash]);

  return (
    <div className="space-y-6">
      {/* Header and Controller */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center bg-slate-800/40 p-4 border border-slate-700/30 rounded-xl shadow-lg gap-4">
        <div>
          <h2 className="text-slate-200 text-base font-semibold">Project Financial Model & Forecast</h2>
          <p className="text-xs text-slate-400">Editable assumptions, cash-balance tracking, and OPEX/COGS sensitivity simulation.</p>
        </div>
        <div className="flex items-center gap-3 bg-slate-900/60 p-2 rounded-lg border border-slate-800">
          <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">OPEX/COGS Cost Factor:</label>
          <input
            type="range"
            min="0.8"
            max="1.5"
            step="0.05"
            value={forecastMultiplier}
            onChange={(e) => setForecastMultiplier(parseFloat(e.target.value))}
            className="w-24 cursor-pointer accent-blue-500"
          />
          <span className="text-xs font-mono font-bold text-blue-400">
            {Math.round(forecastMultiplier * 100)}%
          </span>
        </div>
      </div>

      {/* SVG Chart: Cumulative Cash Balance */}
      <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-5 shadow-lg">
        <h3 className="text-slate-200 text-xs font-bold uppercase tracking-wider mb-4">Cumulative Cash Reserve Forecast (NPR)</h3>
        <div className="relative w-full overflow-hidden flex justify-center">
          <svg viewBox={`0 0 ${chartPoints.w} ${chartPoints.h}`} className="w-full max-w-3xl overflow-visible">
            {/* Grid lines */}
            <line x1="0" y1="0" x2={chartPoints.w} y2="0" stroke="#334155" strokeDasharray="3,3" strokeWidth="0.5" />
            <line x1="0" y1={chartPoints.h / 2} x2={chartPoints.w} y2={chartPoints.h / 2} stroke="#334155" strokeDasharray="3,3" strokeWidth="0.5" />
            <line x1="0" y1={chartPoints.h} x2={chartPoints.w} y2={chartPoints.h} stroke="#334155" strokeDasharray="3,3" strokeWidth="0.5" />
            
            {/* Zero Baseline */}
            <line x1="0" y1={chartPoints.baselineY} x2={chartPoints.w} y2={chartPoints.baselineY} stroke="#f43f5e" strokeWidth="1" strokeDasharray="4,4" opacity="0.6" />
            
            {/* Area under the line */}
            <path
              d={`M 0 ${chartPoints.h} ${chartPoints.points.map(p => `L ${p.x} ${p.y}`).join(' ')} L ${chartPoints.w} ${chartPoints.h} Z`}
              fill="url(#blue-gradient)"
              opacity="0.1"
            />

            {/* Line plot */}
            <path
              d={chartPoints.points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')}
              fill="none"
              stroke="#3b82f6"
              strokeWidth="2"
            />

            {/* Markers */}
            {chartPoints.points.map((p, idx) => (
              <g key={idx}>
                <circle cx={p.x} cy={p.y} r="4" className="fill-blue-500 stroke-slate-900 stroke-2 hover:r-6 transition-all cursor-pointer" />
                <text x={p.x} y={p.y - 8} textAnchor="middle" className="text-[9px] fill-slate-300 font-mono">
                  {(p.value / 1000000).toFixed(1)}M
                </text>
                <text x={p.x} y={chartPoints.h + 12} textAnchor="middle" className="text-[9px] fill-slate-500 font-semibold">
                  {months[idx]}
                </text>
              </g>
            ))}

            <defs>
              <linearGradient id="blue-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        <div className="flex justify-between text-[10px] text-slate-500 mt-6 pt-2 border-t border-slate-700/30">
          <span>* Starting Cash Reserve: NPR 15,000,000</span>
          <span className="text-red-400">Dotted Red: Breakeven / Zero balance line</span>
        </div>
      </div>

      {/* Spreadsheet Grid */}
      <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-5 shadow-lg overflow-x-auto">
        <table className="w-full min-w-[700px] border-collapse text-xs text-slate-300">
          <thead>
            <tr className="border-b border-slate-700 text-slate-400 font-semibold bg-slate-900/30">
              <th className="py-2.5 px-3 text-left w-64">Variable Row / Formula</th>
              <th className="py-2.5 px-2 text-center w-20">Trend</th>
              {months.map(m => (
                <th key={m} className="py-2.5 px-2 text-right">{m}</th>
              ))}
            </tr>
          </thead>
          
          <tbody className="divide-y divide-slate-800/50">
            {/* REVENUE SECTION */}
            <tr className="bg-slate-900/20"><td colSpan={8} className="p-0"><button onClick={() => toggleSection('revenue')} className="w-full py-2 px-3 text-left text-[10px] font-bold text-blue-400 uppercase tracking-wide">{expanded.revenue ? '▾' : '▸'} 1. Revenue / Cash Inflow</button></td></tr>
            {expanded.revenue && rows.filter(r => r.category === 'revenue').map((row) => {
              const rowIndex = rows.findIndex(r => r.name === row.name);
              return (
                <tr key={row.name} className="hover:bg-slate-800/20">
                  <td className="py-2 px-3 font-medium text-slate-200">{row.name}</td>
                  <td className="py-2 px-2 text-center">
                    <svg width="60" height="20" className="inline-block overflow-visible">
                      <path d={getSparklinePath(row.values)} fill="none" stroke="#60a5fa" strokeWidth="1.5" />
                    </svg>
                  </td>
                  {row.values.map((v, cIdx) => (
                    <td key={cIdx} className="py-2 px-2 text-right">
                      <input
                        type="text"
                        value={v.toLocaleString()}
                        onChange={(e) => handleCellChange(rowIndex, cIdx, e.target.value)}
                        className="w-full text-right bg-transparent focus:bg-slate-950 focus:border-slate-700 border-none outline-none font-mono text-slate-300 hover:text-white"
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
            
            {/* COGS SECTION */}
            <tr className="bg-slate-900/20"><td colSpan={8} className="p-0"><button onClick={() => toggleSection('cogs')} className="w-full py-2 px-3 text-left text-[10px] font-bold text-amber-500 uppercase tracking-wide">{expanded.cogs ? '▾' : '▸'} 2. Cost of Goods Sold (COGS)</button></td></tr>
            {expanded.cogs && rows.filter(r => r.category === 'cogs').map((row) => {
              const rowIndex = rows.findIndex(r => r.name === row.name);
              return (
                <tr key={row.name} className="hover:bg-slate-800/20">
                  <td className="py-2 px-3 font-medium text-slate-200">{row.name}</td>
                  <td className="py-2 px-2 text-center">
                    <svg width="60" height="20" className="inline-block overflow-visible">
                      <path d={getSparklinePath(row.values)} fill="none" stroke="#f59e0b" strokeWidth="1.5" />
                    </svg>
                  </td>
                  {row.values.map((v, cIdx) => (
                    <td key={cIdx} className="py-2 px-2 text-right">
                      <input
                        type="text"
                        value={Math.round(v * (forecastMultiplier)).toLocaleString()}
                        onChange={(e) => handleCellChange(rowIndex, cIdx, e.target.value)}
                        className="w-full text-right bg-transparent focus:bg-slate-950 focus:border-slate-700 border-none outline-none font-mono text-slate-300 hover:text-white"
                      />
                    </td>
                  ))}
                </tr>
              );
            })}

            {/* OPEX SECTION */}
            <tr className="bg-slate-900/20"><td colSpan={8} className="p-0"><button onClick={() => toggleSection('opex')} className="w-full py-2 px-3 text-left text-[10px] font-bold text-emerald-500 uppercase tracking-wide">{expanded.opex ? '▾' : '▸'} 3. Operational Expenses (OPEX)</button></td></tr>
            {expanded.opex && rows.filter(r => r.category === 'opex').map((row) => {
              const rowIndex = rows.findIndex(r => r.name === row.name);
              return (
                <tr key={row.name} className="hover:bg-slate-800/20">
                  <td className="py-2 px-3 font-medium text-slate-200">{row.name}</td>
                  <td className="py-2 px-2 text-center">
                    <svg width="60" height="20" className="inline-block overflow-visible">
                      <path d={getSparklinePath(row.values)} fill="none" stroke="#10b981" strokeWidth="1.5" />
                    </svg>
                  </td>
                  {row.values.map((v, cIdx) => (
                    <td key={cIdx} className="py-2 px-2 text-right">
                      <input
                        type="text"
                        value={Math.round(v * (forecastMultiplier)).toLocaleString()}
                        onChange={(e) => handleCellChange(rowIndex, cIdx, e.target.value)}
                        className="w-full text-right bg-transparent focus:bg-slate-950 focus:border-slate-700 border-none outline-none font-mono text-slate-300 hover:text-white"
                      />
                    </td>
                  ))}
                </tr>
              );
            })}

            {/* SUMMARY OUTPUTS */}
            <tr className="border-t-2 border-slate-700 bg-slate-900/40 font-semibold"><td colSpan={8} className="p-0"><button onClick={() => toggleSection('outputs')} className="w-full py-2 px-3 text-left text-[10px] uppercase text-slate-400 tracking-wide">{expanded.outputs ? '▾' : '▸'} 4. Summary Outputs</button></td></tr>
            
            {expanded.outputs && <tr className="hover:bg-slate-800/10">
              <td className="py-2 px-3 text-slate-200">Total Revenue (Cash Inflow)</td>
              <td className="py-2 px-2 text-center">
                <svg width="60" height="20" className="inline-block overflow-visible">
                  <path d={getSparklinePath(summary.totalRevenue)} fill="none" stroke="#3b82f6" strokeWidth="1.5" />
                </svg>
              </td>
              {summary.totalRevenue.map((v, cIdx) => (
                <td key={cIdx} className="py-2 px-2 text-right font-mono text-blue-400 font-bold">{v.toLocaleString()}</td>
              ))}
            </tr>}
            
            {expanded.outputs && <tr className="hover:bg-slate-800/10">
              <td className="py-2 px-3 text-slate-200">Total Expenditures (COGS + OPEX)</td>
              <td className="py-2 px-2 text-center">
                <svg width="60" height="20" className="inline-block overflow-visible">
                  {/* Combines COGS + OPEX */}
                  <path d={getSparklinePath(summary.totalCogs.map((v,i) => v + summary.totalOpex[i]))} fill="none" stroke="#ef4444" strokeWidth="1.5" />
                </svg>
              </td>
              {summary.totalCogs.map((v, cIdx) => (
                <td key={cIdx} className="py-2 px-2 text-right font-mono text-amber-500 font-bold">
                  {(v + summary.totalOpex[cIdx]).toLocaleString()}
                </td>
              ))}
            </tr>}

            {expanded.outputs && <tr className="bg-slate-900/40 hover:bg-slate-800/20 font-bold border-y border-slate-700">
              <td className="py-2.5 px-3 text-slate-100">Monthly Net Cash Flow</td>
              <td className="py-2.5 px-2 text-center">
                <svg width="60" height="20" className="inline-block overflow-visible">
                  <path d={getSparklinePath(summary.netCashFlow)} fill="none" stroke="#8b5cf6" strokeWidth="1.5" />
                </svg>
              </td>
              {summary.netCashFlow.map((v, cIdx) => (
                <td key={cIdx} className={`py-2.5 px-2 text-right font-mono ${v >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                  {v.toLocaleString()}
                </td>
              ))}
            </tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
