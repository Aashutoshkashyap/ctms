// AI Assistant Component
import React, { useState } from 'react';
import { Activity, Dependency } from '../lib/cpm';
import { parseDailyReport, analyzeDelay, getRecoveryPlan, getMonthlySummary, generateWbsFromTender, ParsedDailyLog, DelayAnalysisResult } from '../lib/ai';
import { storage } from '../lib/storage';

interface AiAssistantProps {
  activities: Activity[];
  onSubmitDailyReport: (report: any, workItems: any[], materialItems: any[]) => void;
  currentDate: string;
  onReloadData?: () => void;
  projectStartDate: string;
}

export default function AiAssistant({
  activities,
  onSubmitDailyReport,
  currentDate,
  onReloadData,
  projectStartDate
}: AiAssistantProps) {
  const [activeTask, setActiveTask] = useState<'parser' | 'delay' | 'recovery' | 'summary' | 'wbs_scanner'>('parser');
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);

  // Parser results
  const [parsedLog, setParsedLog] = useState<ParsedDailyLog | null>(null);

  // Analysis result text
  const [textResult, setTextResult] = useState<string | null>(null);
  const [delayAnalysis, setDelayAnalysis] = useState<DelayAnalysisResult | null>(null);

  // WBS Scanner Results
  const [wbsResult, setWbsResult] = useState<Awaited<ReturnType<typeof generateWbsFromTender>> | null>(null);

  const handleWbsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    setLoading(true);
    setWbsResult(null);
    try {
      const result = await generateWbsFromTender(inputText, projectStartDate);
      setWbsResult(result);
    } catch (err) {
      alert('WBS generation failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyWbs = () => {
    if (!wbsResult) return;
    if (confirm('Warning: This will overwrite all current WBS activities and dependencies for the active project. Proceed?')) {
      storage.applyGeneratedSchedule(wbsResult.wbsItems, wbsResult.activities, wbsResult.dependencies);
      if (onReloadData) onReloadData();
      alert('WBS and network dependencies applied successfully! Project CPM has been re-scheduled.');
      setWbsResult(null);
      setInputText('');
    }
  };

  const handleParseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    setLoading(true);
    setParsedLog(null);
    try {
      const parsed = await parseDailyReport(inputText, activities);
      setParsedLog(parsed);
    } catch (err) {
      alert('Failed to parse text. Using heuristic values.');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyParsedLog = () => {
    if (!parsedLog) return;
    
    // Construct standard report structure
    const report = {
      report_date: currentDate,
      weather: parsedLog.weather,
      manpower_total: parsedLog.workItems.reduce((sum, item) => sum + Number(item.manpowerCount), 0),
      equipment_total: parsedLog.workItems.reduce((sum, item) => sum + Number(item.equipmentCount), 0),
      site_instructions: parsedLog.siteInstructions,
      obstruction_reasons: parsedLog.obstructionReasons,
      next_day_plan: parsedLog.nextDayPlan,
      submitted_by: 'AI Assistant Parser'
    };

    const workItems = parsedLog.workItems.map(item => ({
      activity_id: item.activityId,
      quantity_completed: item.quantityCompleted,
      manpower_count: item.manpowerCount,
      equipment_count: item.equipmentCount,
      delay_reason: item.delayReason
    }));

    const materialItems = parsedLog.materialsReceived.map(m => ({
      material_name: m.name,
      unit: m.unit,
      received_qty: m.receivedQty,
      consumed_qty: m.consumedQty,
      vendor: m.vendor
    }));

    onSubmitDailyReport(report, workItems, materialItems);
    alert('AI parsed quantities submitted to database. CPM timelines regenerated successfully!');
    setParsedLog(null);
    setInputText('');
  };

  const handleDelaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    setLoading(true);
    setDelayAnalysis(null);
    try {
      const result = await analyzeDelay(
        inputText,
        'Foundation Excavation',
        15, // Mock default delay duration
        true // Mock default critical
      );
      setDelayAnalysis(result);
    } catch (err) {
      alert('Analysis failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTextResult(null);
    try {
      const criticalPath = activities.filter(a => a.is_critical);
      const plan = await getRecoveryPlan(18, criticalPath); // Mock default 18 days delay
      setTextResult(plan);
    } catch (err) {
      alert('Failed to generate plan.');
    } finally {
      setLoading(false);
    }
  };

  const handleSummarySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTextResult(null);
    try {
      const summary = await getMonthlySummary(
        'Kathmandu-Terai Section 3',
        42.0, // planned
        35.0, // actual
        0.83, // SPI
        0.88, // CPI
        4, // active risks
        18 // delay days
      );
      setTextResult(summary);
    } catch (err) {
      alert('Failed to generate summary.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 text-xs text-slate-300">
      {/* Service Tabs */}
      <div className="flex flex-wrap bg-slate-900/60 p-1 rounded-lg border border-slate-800/80 max-w-4xl gap-1">
        <button 
          onClick={() => { setActiveTask('parser'); setParsedLog(null); setInputText(''); setTextResult(null); setDelayAnalysis(null); setWbsResult(null); }}
          className={`flex-1 min-w-[140px] py-2 text-center rounded-md font-semibold transition ${activeTask === 'parser' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
        >
          📝 AI Daily Report Parser
        </button>
        <button 
          onClick={() => { setActiveTask('delay'); setParsedLog(null); setInputText(''); setTextResult(null); setDelayAnalysis(null); setWbsResult(null); }}
          className={`flex-1 min-w-[140px] py-2 text-center rounded-md font-semibold transition ${activeTask === 'delay' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
        >
          🚨 EOT Delay Analyzer
        </button>
        <button 
          onClick={() => { setActiveTask('recovery'); setParsedLog(null); setInputText(''); setTextResult(null); setDelayAnalysis(null); setWbsResult(null); }}
          className={`flex-1 min-w-[140px] py-2 text-center rounded-md font-semibold transition ${activeTask === 'recovery' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
        >
          💪 Recovery Planner
        </button>
        <button 
          onClick={() => { setActiveTask('summary'); setParsedLog(null); setInputText(''); setTextResult(null); setDelayAnalysis(null); setWbsResult(null); }}
          className={`flex-1 min-w-[140px] py-2 text-center rounded-md font-semibold transition ${activeTask === 'summary' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
        >
          📝 Executive Report Writer
        </button>
        <button 
          onClick={() => { setActiveTask('wbs_scanner'); setParsedLog(null); setInputText(''); setTextResult(null); setDelayAnalysis(null); setWbsResult(null); }}
          className={`flex-1 min-w-[140px] py-2 text-center rounded-md font-semibold transition ${activeTask === 'wbs_scanner' ? 'bg-purple-600 text-white shadow' : 'text-purple-400 hover:bg-purple-500/10'}`}
        >
          🔍 AI Tender WBS Scanner
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Input area */}
        <div className="lg:col-span-1 bg-slate-800/50 border border-slate-700/40 p-5 rounded-xl shadow-lg space-y-4">
          <h3 className="text-slate-200 text-sm font-semibold capitalize">
            {activeTask === 'parser' && 'Parse Daily Progress Note'}
            {activeTask === 'delay' && 'Analyze Claims Eligibility'}
            {activeTask === 'recovery' && 'Analyze Schedule Compressions'}
            {activeTask === 'summary' && 'Generate Monthly Executive Summary'}
            {activeTask === 'wbs_scanner' && 'Scan Tender & Build WBS'}
          </h3>
          
          {activeTask === 'parser' && (
            <form onSubmit={handleParseSubmit} className="space-y-3">
              <label className="block text-slate-400">Describe site works completed, workers count, equipment, and weather freeform:</label>
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="e.g. Sunny day. 15 laborers and 3 excavators excavated 1200 m3 soil for foundation. Poured 150m3 of PCC cement at Pier footing cap. Shivam cement delivered 200 bags. Delayed concrete transit mixer by 2 hours due to local traffic."
                rows={5}
                className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-slate-200 focus:outline-none focus:border-blue-500"
                required
              />
              <button 
                type="submit" 
                disabled={loading}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded shadow transition w-full disabled:opacity-50"
              >
                {loading ? 'Processing...' : '🚀 Parse Freeform Notes'}
              </button>
            </form>
          )}

          {activeTask === 'delay' && (
            <form onSubmit={handleDelaySubmit} className="space-y-3">
              <label className="block text-slate-400">Input delay event name or issues to check contract eligibility:</label>
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="e.g. Design approval detailed drawings for bridge structural Cap was delayed by client engineer for 28 days."
                rows={4}
                className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-slate-200 focus:outline-none"
                required
              />
              <button 
                type="submit" 
                disabled={loading}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded shadow transition w-full disabled:opacity-50"
              >
                {loading ? 'Analyzing...' : '🔎 Analyze Delay Clause'}
              </button>
            </form>
          )}

          {activeTask === 'wbs_scanner' && (
            <form onSubmit={handleWbsSubmit} className="space-y-3">
              <label className="block text-slate-400">Paste Bill of Quantities (BoQ) items, tender scope paragraphs, or contract requirements text here:</label>
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="e.g. Scope includes bulk excavation works for Expressway Section 3, concrete foundations for 4 bridge structures, sub-grade preparation, and final commissioning with Taking Over Dossiers."
                rows={6}
                className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-slate-200 focus:outline-none focus:border-blue-500"
                required
              />
              <button 
                type="submit" 
                disabled={loading}
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded shadow transition w-full disabled:opacity-50"
              >
                {loading ? 'Analyzing...' : '🚀 Scan Scope & Build WBS'}
              </button>
            </form>
          )}

          {activeTask === 'recovery' && (
            <div className="space-y-3">
              <p className="text-slate-400 leading-normal">
                Generates schedule compression adjustments. The AI scans the delayed critical WBS nodes and recommends shift models or plant capacity additions to recover contract durations.
              </p>
              <button 
                onClick={handleRecoverySubmit} 
                disabled={loading}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded shadow transition w-full disabled:opacity-50"
              >
                {loading ? 'Planning...' : '💪 Generate Critical Recovery Plan'}
              </button>
            </div>
          )}

          {activeTask === 'summary' && (
            <div className="space-y-3">
              <p className="text-slate-400 leading-normal">
                Compile EVM metrics (SPI 0.83, CPI 0.88, 18 days delay, 4 risks) into a formal monthly progress executive highlights report.
              </p>
              <button 
                onClick={handleSummarySubmit} 
                disabled={loading}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded shadow transition w-full disabled:opacity-50"
              >
                {loading ? 'Writing...' : '✍️ Generate Monthly Progress Summary'}
              </button>
            </div>
          )}
        </div>

        {/* Results Output area */}
        <div className="lg:col-span-2 bg-slate-800/50 border border-slate-700/40 p-5 rounded-xl shadow-lg flex flex-col min-h-[350px]">
          <h3 className="text-slate-200 text-sm font-semibold mb-3">AI Intelligence Output</h3>
          
          {loading && (
            <div className="flex-1 flex flex-col items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              <span className="text-slate-500 mt-2">AI is parsing and recalculating network logic...</span>
            </div>
          )}

          {/* Parsed log output with submit to DB action */}
          {!loading && activeTask === 'parser' && parsedLog && (
            <div className="flex-grow flex flex-col space-y-3">
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-2.5 overflow-y-auto max-h-[300px]">
                <div className="flex justify-between border-b border-slate-800 pb-1 font-semibold text-slate-200 text-xs">
                  <span>Weather: {parsedLog.weather}</span>
                  <span className="text-emerald-400">Parsed Successful</span>
                </div>
                
                {/* Work items */}
                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Work Quantities & Manpower</div>
                  <div className="space-y-1 text-xs">
                    {parsedLog.workItems.map((item, idx) => {
                      const act = activities.find(a => a.id === item.activityId);
                      return (
                        <div key={idx} className="flex justify-between bg-slate-850 p-2 rounded">
                          <span className="text-slate-200 font-semibold">{act ? act.name : 'Unknown Activity'}</span>
                          <span className="font-mono text-slate-300">
                            {item.quantityCompleted} {act?.unit} | {item.manpowerCount} Labor | {item.equipmentCount} Machine
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Materials Received */}
                {parsedLog.materialsReceived.length > 0 && (
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Materials Delivered</div>
                    <div className="space-y-1 text-xs">
                      {parsedLog.materialsReceived.map((m, idx) => (
                        <div key={idx} className="flex justify-between bg-slate-850 p-1.5 rounded text-[11px]">
                          <span>{m.name} ({m.unit})</span>
                          <span className="font-mono text-slate-400">Rec: {m.receivedQty} | Cons: {m.consumedQty} | Vendor: {m.vendor}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Delay details */}
                {parsedLog.obstructionReasons && (
                  <div className="border border-amber-500/20 bg-amber-500/5 p-2 rounded text-xs text-amber-400">
                    <strong>Obstructions logged:</strong> {parsedLog.obstructionReasons}
                  </div>
                )}
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  onClick={handleApplyParsedLog}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded shadow transition"
                >
                  🚀 Submit to Site Database & Recalculate CPM
                </button>
              </div>
            </div>
          )}

          {/* Delay analyzer result */}
          {!loading && activeTask === 'delay' && delayAnalysis && (
            <div className="flex-1 space-y-3 overflow-y-auto max-h-[350px]">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-900 p-2.5 rounded border border-slate-800">
                  <div className="text-[10px] text-slate-500">Contractual Clause</div>
                  <div className="font-semibold text-slate-200 mt-0.5">{delayAnalysis.contractClauseRef}</div>
                </div>
                <div className="bg-slate-900 p-2.5 rounded border border-slate-800">
                  <div className="text-[10px] text-slate-500">Claim Eligibility</div>
                  <div className="font-bold text-emerald-400 mt-0.5 capitalize">{delayAnalysis.claimEligibility} Eligibility</div>
                </div>
              </div>
              <div className="bg-slate-900/60 p-3 rounded border border-slate-800 text-xs leading-normal">
                <strong>Analysis Summary:</strong> {delayAnalysis.summary}
              </div>
              
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold text-slate-500 uppercase">Evidence Document Checklist Needed:</div>
                <ul className="list-disc list-inside space-y-1 text-slate-400">
                  {delayAnalysis.evidenceChecklist.map((ev, i) => (
                    <li key={i}>{ev}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* WBS Scanner Output */}
          {!loading && activeTask === 'wbs_scanner' && wbsResult && (
            <div className="flex-grow flex flex-col space-y-3">
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-2.5 overflow-y-auto max-h-[300px] text-xs">
                <div className="border-b border-slate-800 pb-1 font-semibold text-slate-200 text-[11px] flex justify-between">
                  <span>{wbsResult.wbsItems.length} WBS nodes · {wbsResult.activities.length} activities</span>
                  <span className="text-emerald-400 font-bold">Analysis Complete</span>
                </div>
                <div className="space-y-2">
                  {wbsResult.activities.map((act) => (
                    <div key={act.id} className="bg-slate-850 p-2 rounded border border-slate-800/40">
                      <div className="flex justify-between font-bold text-slate-200 text-[11px]">
                        <span>{act.wbs_code} - {act.name}</span>
                        <span className="text-blue-400 font-mono">{act.planned_duration} Days</span>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-1 flex justify-between">
                        <span>Qty: {act.planned_quantity} {act.unit} (Wt: {act.weightage}%)</span>
                        <span>Resource: {act.resource_required}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-slate-800 pt-2 font-semibold text-slate-200 text-[11px]">
                  Generated Sequential Dependencies ({wbsResult.dependencies.length})
                </div>
                <div className="space-y-1 text-[10px] text-slate-400">
                  {wbsResult.dependencies.map((dep, idx) => {
                    const pred = wbsResult.activities.find(a => a.id === dep.predecessor_id);
                    const succ = wbsResult.activities.find(a => a.id === dep.successor_id);
                    return (
                      <div key={idx} className="bg-slate-950 p-1.5 rounded flex justify-between font-mono">
                        <span>{pred ? pred.name : dep.predecessor_id}</span>
                        <span className="text-amber-500">───({dep.type} +{dep.lag}d)───&gt;</span>
                        <span>{succ ? succ.name : dep.successor_id}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              
              <div className="flex justify-end gap-2">
                <button
                  onClick={handleApplyWbs}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded shadow transition"
                >
                  📥 Apply WBS to Project Database & CPM
                </button>
              </div>
            </div>
          )}

          {/* Heuristics / Text outputs */}
          {!loading && textResult && (
            <div className="flex-1 overflow-y-auto max-h-[350px] bg-slate-950/30 border border-slate-850 p-3.5 rounded-lg whitespace-pre-wrap font-mono text-[11px] leading-relaxed">
              {textResult}
            </div>
          )}

          {!loading && !parsedLog && !textResult && !delayAnalysis && !wbsResult && (
            <div className="flex-grow flex items-center justify-center text-center text-slate-500 text-xs">
              Waiting for input. Write details in the left box and run AI parsing/analysis.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
