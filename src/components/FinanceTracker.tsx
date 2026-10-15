// Causal-Style Financial Tracker and Spreadsheet Component
import React, { useState, useMemo, useEffect } from 'react';
import { storage, FinanceRow } from '../lib/storage';

const DEFAULT_FINANCE_ROWS: FinanceRow[] = [
  {
    id: 'fin-revenue-ipc',
    name: 'Contract IPC Billings',
    category: 'revenue',
    values: [28000000, 32000000, 41000000, 38000000, 45000000, 48000000],
  },
  {
    id: 'fin-revenue-variations',
    name: 'Variation Claims Confirmed',
    category: 'revenue',
    values: [0, 1200000, 0, 3500000, 0, 1800000],
  },
  {
    id: 'fin-cogs-subcontractors',
    name: 'Subcontractor Certificates',
    category: 'cogs',
    values: [12000000, 15000000, 18000000, 16000000, 22000000, 24000000],
  },
  {
    id: 'fin-cogs-materials',
    name: 'Material Logistics & Fuel',
    category: 'cogs',
    values: [6000000, 7500000, 9000000, 8500000, 10500000, 11000000],
  },
  {
    id: 'fin-cogs-equipment',
    name: 'Equipment Hire & Maintenance',
    category: 'cogs',
    values: [3000000, 3200000, 4500000, 4000000, 5000000, 5500000],
  },
  {
    id: 'fin-opex-camp',
    name: 'Camps & Site Overheads',
    category: 'opex',
    values: [1500000, 1500000, 1600000, 1600000, 1800000, 1800000],
  },
  {
    id: 'fin-opex-hq',
    name: 'Kathmandu HQ Overhead Allocation',
    category: 'opex',
    values: [1000000, 1000000, 1000000, 1000000, 1000000, 1000000],
  },
  {
    id: 'fin-opex-ehs',
    name: 'EHS & Quality testing kits',
    category: 'opex',
    values: [500000, 600000, 450000, 800000, 550000, 900000],
  },
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
        const mult = r.category === 'cogs' || r.category === 'opex' ? forecastMultiplier : 1;
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

    const totalRevenueSum = revenueRow.reduce((a, b) => a + b, 0);
    const totalCostSum = cogsRow.reduce((a, b) => a + b, 0) + opexRow.reduce((a, b) => a + b, 0);
    const totalNetSum = totalRevenueSum - totalCostSum;
    const finalCashPosition = cumulativeCash[cumulativeCash.length - 1];

    return {
      totalRevenue: revenueRow,
      totalCogs: cogsRow,
      totalOpex: opexRow,
      netCashFlow,
      cumulativeCash,
      totalRevenueSum,
      totalCostSum,
      totalNetSum,
      finalCashPosition,
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

    return values
      .map((val, idx) => {
        const x = (idx / (values.length - 1)) * width;
        const y = height - ((val - min) / range) * height + 2; // pad 2px
        return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  };

  // Calculate scales for the cumulative cash balance chart
  const chartPoints = useMemo(() => {
    const vals = summary.cumulativeCash;
    const min = Math.min(...vals, 0);
    const max = Math.max(...vals);
    const range = max - min || 1;
    const w = 640;
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
      {/* 1. Header and Sensitivity Controller */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 text-sm">📈</span>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Commercial Projections & Cash Flow</span>
          </div>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">Project Financial Model & Forecast</h1>
          <p className="mt-1 text-xs md:text-sm text-slate-600 max-w-2xl leading-relaxed">
            Interactive revenue and cost variables, cash runway simulations, and OPEX/COGS sensitivity stress testing.
          </p>
        </div>

        <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 p-2.5 rounded-xl">
          <label className="text-[10px] text-slate-600 font-bold uppercase tracking-wider">Cost Stress Factor:</label>
          <input
            type="range"
            min="0.8"
            max="1.5"
            step="0.05"
            value={forecastMultiplier}
            onChange={e => setForecastMultiplier(parseFloat(e.target.value))}
            className="w-24 cursor-pointer accent-blue-600"
          />
          <span className="text-xs font-mono font-bold text-blue-700 bg-white border border-slate-200 px-2 py-0.5 rounded-lg shadow-2xs">
            {Math.round(forecastMultiplier * 100)}%
          </span>
        </div>
      </section>

      {/* 2. 4 Colorful KPI Summary Cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">6-Month Revenue</span>
            <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center text-sm">💰</span>
          </div>
          <div className="mt-3">
            <div className="text-2xl md:text-3xl font-black text-slate-900">
              NPR {(summary.totalRevenueSum / 1_000_000).toFixed(1)}m
            </div>
            <div className="text-[11px] text-slate-500 mt-1">IPCs &amp; confirmed claims</div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">6-Month Outflow</span>
            <span className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center text-sm">💳</span>
          </div>
          <div className="mt-3">
            <div className="text-2xl md:text-3xl font-black text-amber-600">
              NPR {(summary.totalCostSum / 1_000_000).toFixed(1)}m
            </div>
            <div className="text-[11px] text-slate-500 mt-1">COGS &amp; site OPEX</div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Net Operating Cash</span>
            <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${summary.totalNetSum >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
              ⚖️
            </span>
          </div>
          <div className="mt-3">
            <div className={`text-2xl md:text-3xl font-black ${summary.totalNetSum >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              NPR {(summary.totalNetSum / 1_000_000).toFixed(1)}m
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Cumulative net margin</div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Projected Cash Balance</span>
            <span className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-sm">🏦</span>
          </div>
          <div className="mt-3">
            <div className="text-2xl md:text-3xl font-black text-indigo-600">
              NPR {(summary.finalCashPosition / 1_000_000).toFixed(1)}m
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Starting base: NPR 15.0m</div>
          </div>
        </div>
      </section>

      {/* 3. SVG Chart: Cumulative Cash Balance */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">Cumulative Cash Reserve Forecast (NPR)</h3>
            <p className="text-xs text-slate-500 mt-0.5">Estimated liquid liquidity across 6-month projection window</p>
          </div>
          <span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full">
            Starting Base: NPR 15M
          </span>
        </div>

        <div className="relative w-full overflow-hidden flex justify-center py-2">
          <svg viewBox={`0 0 ${chartPoints.w} ${chartPoints.h}`} className="w-full max-w-3xl overflow-visible">
            {/* Grid lines */}
            <line x1="0" y1="0" x2={chartPoints.w} y2="0" stroke="#e2e8f0" strokeDasharray="3,3" strokeWidth="1" />
            <line x1="0" y1={chartPoints.h / 2} x2={chartPoints.w} y2={chartPoints.h / 2} stroke="#e2e8f0" strokeDasharray="3,3" strokeWidth="1" />
            <line x1="0" y1={chartPoints.h} x2={chartPoints.w} y2={chartPoints.h} stroke="#e2e8f0" strokeDasharray="3,3" strokeWidth="1" />

            {/* Zero balance baseline if within chart */}
            {chartPoints.baselineY >= 0 && chartPoints.baselineY <= chartPoints.h && (
              <line
                x1="0"
                y1={chartPoints.baselineY}
                x2={chartPoints.w}
                y2={chartPoints.baselineY}
                stroke="#f43f5e"
                strokeDasharray="4,4"
                strokeWidth="1.5"
              />
            )}

            {/* Area under the line */}
            <path
              d={`M 0 ${chartPoints.h} ${chartPoints.points.map(p => `L ${p.x} ${p.y}`).join(' ')} L ${chartPoints.w} ${chartPoints.h} Z`}
              fill="url(#blue-gradient-finance)"
              opacity="0.15"
            />

            {/* Line plot */}
            <path
              d={chartPoints.points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')}
              fill="none"
              stroke="#2563eb"
              strokeWidth="2.5"
            />

            {/* Markers */}
            {chartPoints.points.map((p, idx) => (
              <g key={idx}>
                <circle cx={p.x} cy={p.y} r="5" className="fill-blue-600 stroke-white stroke-2 hover:r-7 transition-all cursor-pointer" />
                <text x={p.x} y={p.y - 10} textAnchor="middle" className="text-[10px] fill-slate-800 font-bold font-mono">
                  {(p.value / 1_000_000).toFixed(1)}M
                </text>
                <text x={p.x} y={chartPoints.h + 16} textAnchor="middle" className="text-[10px] fill-slate-500 font-bold">
                  {months[idx]}
                </text>
              </g>
            ))}

            <defs>
              <linearGradient id="blue-gradient-finance" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563eb" />
                <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        <div className="flex justify-between text-[11px] text-slate-500 mt-6 pt-3 border-t border-slate-100">
          <span>* Initial starting reserve: NPR 15,000,000</span>
          <span className="text-rose-600 font-semibold">Dotted Red: Breakeven / Zero cash balance line</span>
        </div>
      </section>

      {/* 4. Spreadsheet Grid */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="font-extrabold text-slate-900 text-sm">Monthly Revenue &amp; Expenditure Breakdown</h3>
            <p className="text-xs text-slate-500">Click any figure in the table below to edit monthly projections</p>
          </div>
          <span className="text-xs text-slate-500 font-medium">All figures in NPR</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                <th className="py-2.5 px-3 text-left w-64">Variable Row / Formula</th>
                <th className="py-2.5 px-2 text-center w-20">Trend</th>
                {months.map(m => (
                  <th key={m} className="py-2.5 px-2 text-right">{m}</th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 text-slate-800">
              {/* REVENUE SECTION */}
              <tr className="bg-blue-50/50">
                <td colSpan={8} className="p-0">
                  <button
                    onClick={() => toggleSection('revenue')}
                    className="w-full py-2 px-3 text-left text-xs font-bold text-blue-700 uppercase tracking-wide flex items-center gap-1.5"
                  >
                    <span>{expanded.revenue ? '▾' : '▸'}</span>
                    <span>1. Revenue &amp; Cash Inflow</span>
                  </button>
                </td>
              </tr>
              {expanded.revenue &&
                rows
                  .filter(r => r.category === 'revenue')
                  .map(row => {
                    const rowIndex = rows.findIndex(r => r.name === row.name);
                    return (
                      <tr key={row.name} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2 px-3 font-medium text-slate-900">{row.name}</td>
                        <td className="py-2 px-2 text-center">
                          <svg width="60" height="20" className="inline-block overflow-visible">
                            <path d={getSparklinePath(row.values)} fill="none" stroke="#2563eb" strokeWidth="1.5" />
                          </svg>
                        </td>
                        {row.values.map((v, cIdx) => (
                          <td key={cIdx} className="py-2 px-2 text-right">
                            <input
                              type="text"
                              value={v.toLocaleString()}
                              onChange={e => handleCellChange(rowIndex, cIdx, e.target.value)}
                              className="w-full text-right bg-transparent focus:bg-white focus:ring-1 focus:ring-blue-500 rounded px-1.5 py-0.5 border border-transparent hover:border-slate-300 font-mono text-slate-800"
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}

              {/* COGS SECTION */}
              <tr className="bg-amber-50/50">
                <td colSpan={8} className="p-0">
                  <button
                    onClick={() => toggleSection('cogs')}
                    className="w-full py-2 px-3 text-left text-xs font-bold text-amber-800 uppercase tracking-wide flex items-center gap-1.5"
                  >
                    <span>{expanded.cogs ? '▾' : '▸'}</span>
                    <span>2. Cost of Goods Sold (Direct Works &amp; Plant)</span>
                  </button>
                </td>
              </tr>
              {expanded.cogs &&
                rows
                  .filter(r => r.category === 'cogs')
                  .map(row => {
                    const rowIndex = rows.findIndex(r => r.name === row.name);
                    return (
                      <tr key={row.name} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2 px-3 font-medium text-slate-900">{row.name}</td>
                        <td className="py-2 px-2 text-center">
                          <svg width="60" height="20" className="inline-block overflow-visible">
                            <path d={getSparklinePath(row.values)} fill="none" stroke="#d97706" strokeWidth="1.5" />
                          </svg>
                        </td>
                        {row.values.map((v, cIdx) => (
                          <td key={cIdx} className="py-2 px-2 text-right">
                            <input
                              type="text"
                              value={Math.round(v * forecastMultiplier).toLocaleString()}
                              onChange={e => handleCellChange(rowIndex, cIdx, e.target.value)}
                              className="w-full text-right bg-transparent focus:bg-white focus:ring-1 focus:ring-amber-500 rounded px-1.5 py-0.5 border border-transparent hover:border-slate-300 font-mono text-slate-800"
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}

              {/* OPEX SECTION */}
              <tr className="bg-emerald-50/50">
                <td colSpan={8} className="p-0">
                  <button
                    onClick={() => toggleSection('opex')}
                    className="w-full py-2 px-3 text-left text-xs font-bold text-emerald-800 uppercase tracking-wide flex items-center gap-1.5"
                  >
                    <span>{expanded.opex ? '▾' : '▸'}</span>
                    <span>3. Operational Expenses (Site &amp; HQ Overheads)</span>
                  </button>
                </td>
              </tr>
              {expanded.opex &&
                rows
                  .filter(r => r.category === 'opex')
                  .map(row => {
                    const rowIndex = rows.findIndex(r => r.name === row.name);
                    return (
                      <tr key={row.name} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2 px-3 font-medium text-slate-900">{row.name}</td>
                        <td className="py-2 px-2 text-center">
                          <svg width="60" height="20" className="inline-block overflow-visible">
                            <path d={getSparklinePath(row.values)} fill="none" stroke="#059669" strokeWidth="1.5" />
                          </svg>
                        </td>
                        {row.values.map((v, cIdx) => (
                          <td key={cIdx} className="py-2 px-2 text-right">
                            <input
                              type="text"
                              value={Math.round(v * forecastMultiplier).toLocaleString()}
                              onChange={e => handleCellChange(rowIndex, cIdx, e.target.value)}
                              className="w-full text-right bg-transparent focus:bg-white focus:ring-1 focus:ring-emerald-500 rounded px-1.5 py-0.5 border border-transparent hover:border-slate-300 font-mono text-slate-800"
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}

              {/* SUMMARY OUTPUTS */}
              <tr className="bg-slate-100/90 font-bold border-t-2 border-slate-300">
                <td colSpan={8} className="p-0">
                  <button
                    onClick={() => toggleSection('outputs')}
                    className="w-full py-2 px-3 text-left text-xs font-black text-slate-900 uppercase tracking-wide flex items-center gap-1.5"
                  >
                    <span>{expanded.outputs ? '▾' : '▸'}</span>
                    <span>4. Consolidated Financial Summary</span>
                  </button>
                </td>
              </tr>

              {expanded.outputs && (
                <tr className="hover:bg-slate-50 font-semibold">
                  <td className="py-2.5 px-3 text-slate-900">Total Revenue (Inflow)</td>
                  <td className="py-2.5 px-2 text-center">
                    <svg width="60" height="20" className="inline-block overflow-visible">
                      <path d={getSparklinePath(summary.totalRevenue)} fill="none" stroke="#2563eb" strokeWidth="1.5" />
                    </svg>
                  </td>
                  {summary.totalRevenue.map((v, cIdx) => (
                    <td key={cIdx} className="py-2.5 px-2 text-right font-mono text-blue-700 font-bold">
                      {v.toLocaleString()}
                    </td>
                  ))}
                </tr>
              )}

              {expanded.outputs && (
                <tr className="hover:bg-slate-50 font-semibold">
                  <td className="py-2.5 px-3 text-slate-900">Total Expenditures (COGS + OPEX)</td>
                  <td className="py-2.5 px-2 text-center">
                    <svg width="60" height="20" className="inline-block overflow-visible">
                      <path
                        d={getSparklinePath(summary.totalCogs.map((v, i) => v + summary.totalOpex[i]))}
                        fill="none"
                        stroke="#dc2626"
                        strokeWidth="1.5"
                      />
                    </svg>
                  </td>
                  {summary.totalCogs.map((v, cIdx) => (
                    <td key={cIdx} className="py-2.5 px-2 text-right font-mono text-amber-700 font-bold">
                      {(v + summary.totalOpex[cIdx]).toLocaleString()}
                    </td>
                  ))}
                </tr>
              )}

              {expanded.outputs && (
                <tr className="bg-slate-50/80 hover:bg-slate-100 font-black border-y border-slate-200">
                  <td className="py-3 px-3 text-slate-900">Monthly Net Cash Flow</td>
                  <td className="py-3 px-2 text-center">
                    <svg width="60" height="20" className="inline-block overflow-visible">
                      <path d={getSparklinePath(summary.netCashFlow)} fill="none" stroke="#7c3aed" strokeWidth="2" />
                    </svg>
                  </td>
                  {summary.netCashFlow.map((v, cIdx) => (
                    <td
                      key={cIdx}
                      className={`py-3 px-2 text-right font-mono ${
                        v >= 0 ? 'text-emerald-700' : 'text-rose-600'
                      }`}
                    >
                      {v.toLocaleString()}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
