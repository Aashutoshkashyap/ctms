// BOQ-linked work schedule and critical-path dashboard.
import React, { useState } from 'react';
import { Activity, Dependency, diffDays, addDays, validateDependency } from '../lib/cpm';
import BsDatePicker from './BsDatePicker';
import { formatBsDate } from '../lib/nepaliDate';
import { generateWbsFromTender } from '../lib/ai';
import { activityActualProgress } from '../lib/projectMetrics';

interface CpmTimelineDashboardProps {
  activities: Activity[];
  dependencies: Dependency[];
  project: any;
  onAddDependency: (dep: { predecessor_id: string; successor_id: string; type: 'FS' | 'SS' | 'FF' | 'SF'; lag: number }) => void;
  onDeleteDependency: (id: string) => void;
  onUpdateActivity: (act: Activity) => void;
  onAddActivity: (
    activity: Omit<Activity, 'id' | 'status' | 'actual_quantity'>,
    predecessor?: { id: string; type: Dependency['type']; lag: number }
  ) => void;
  onImportTender: (result: Awaited<ReturnType<typeof generateWbsFromTender>>) => Promise<void>;
  userRole: string;
}

export default function CpmTimelineDashboard({
  activities,
  dependencies,
  project,
  onAddDependency,
  onDeleteDependency,
  onUpdateActivity,
  onAddActivity,
  onImportTender,
  userRole
}: CpmTimelineDashboardProps) {
  const [showAddDep, setShowAddDep] = useState(false);
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [showTenderImport, setShowTenderImport] = useState(false);
  const [tenderText, setTenderText] = useState('');
  const [tenderResult, setTenderResult] = useState<Awaited<ReturnType<typeof generateWbsFromTender>> | null>(null);
  const [tenderBusy, setTenderBusy] = useState(false);
  const [tenderMessage, setTenderMessage] = useState('');
  const [predId, setPredId] = useState('');
  const [succId, setSuccId] = useState('');
  const [depType, setDepType] = useState<'FS' | 'SS' | 'FF' | 'SF'>('FS');
  const [lagDays, setLagDays] = useState(0);
  const [manual, setManual] = useState({
    wbs_code: '', name: '', baseline_start: project.start_date,
    planned_duration: 30, planned_quantity: 1, unit: 'Pkg', weightage: 1,
    resource_required: '', predecessor_id: '', dependency_type: 'FS' as Dependency['type'], lag: 0
  });

  // Quick edit state
  const [editingActId, setEditingActId] = useState<string | null>(null);
  const [editAct, setEditAct] = useState<Partial<Activity>>({});

  const isEditable = ['project_director', 'project_manager', 'planning_engineer'].includes(userRole);
  const today = new Date().toISOString().slice(0, 10);
  const delayDetails = (act: Activity) => {
    const forecastFinish = act.early_finish || act.baseline_finish;
    const forecastDelay = Math.max(0, diffDays(act.baseline_finish, forecastFinish));
    const overdueDays = act.status === 'completed' ? 0 : Math.max(0, diffDays(act.baseline_finish, today));
    const delayDays = Math.max(forecastDelay, overdueDays);
    const progress = activityActualProgress(act);
    if (act.status === 'completed') return delayDays > 0
      ? { delayDays, remark: `Completed ${delayDays} day${delayDays === 1 ? '' : 's'} after baseline — retain as delay record` }
      : { delayDays: 0, remark: 'Completed within baseline' };
    if (delayDays > 0) return { delayDays, remark: `${delayDays} day delay — ${progress.toFixed(0)}% quantity achieved; recovery action required` };
    if (act.is_critical) return { delayDays: 0, remark: 'On critical path — protect resources and access' };
    if (act.is_near_critical) return { delayDays: 0, remark: 'Near-critical — monitor float consumption' };
    return { delayDays: 0, remark: 'On programme' };
  };
  const delayedActivities = activities.filter(activity => delayDetails(activity).delayDays > 0);

  // Gantt Chart Range Math
  const projStart = new Date(project.start_date);
  const projEnd = new Date(project.target_completion_date);
  // Extend timeline view by 60 days in case of delays
  const totalProjDays = Math.max(900, diffDays(project.start_date, project.target_completion_date) + 60);

  const getPercentOffset = (dateStr: string) => {
    const days = diffDays(project.start_date, dateStr);
    return Math.max(0, Math.min(100, (days / totalProjDays) * 100));
  };

  const getPercentWidth = (startStr: string, finishStr: string) => {
    const duration = diffDays(startStr, finishStr);
    return Math.max(1, (duration / totalProjDays) * 100);
  };

  const handleSubmitDep = (e: React.FormEvent) => {
    e.preventDefault();
    if (!predId || !succId || predId === succId) {
      alert('Select two different activities.');
      return;
    }
    const check = validateDependency(dependencies, { predecessor_id: predId, successor_id: succId });
    if (!check.valid) {
      alert(check.reason || 'Invalid dependency relationship.');
      return;
    }
    onAddDependency({
      predecessor_id: predId,
      successor_id: succId,
      type: depType,
      lag: lagDays
    });
    setPredId('');
    setSuccId('');
    setShowAddDep(false);
  };

  const handleStartEdit = (act: Activity) => {
    setEditingActId(act.id);
    setEditAct({ ...act });
  };

  const handleSaveEdit = (act: Activity) => {
    const duration = Number(editAct.planned_duration || act.planned_duration);
    const baselineStart = String(editAct.baseline_start || act.baseline_start);
    onUpdateActivity({
      ...act,
      ...editAct,
      planned_duration: duration,
      planned_quantity: Number(editAct.planned_quantity || 0),
      baseline_start: baselineStart,
      baseline_finish: editAct.baseline_finish || addDays(baselineStart, Math.max(1, duration) - 1),
      remaining_duration: Number(editAct.remaining_duration ?? duration),
    });
    setEditingActId(null);
  };

  const handleAddActivity = (event: React.FormEvent) => {
    event.preventDefault();
    const baselineFinish = addDays(manual.baseline_start, Math.max(1, manual.planned_duration) - 1);
    onAddActivity({
      wbs_code: manual.wbs_code.trim(),
      name: manual.name.trim(),
      baseline_start: manual.baseline_start,
      baseline_finish: baselineFinish,
      planned_duration: manual.planned_duration,
      planned_quantity: manual.planned_quantity,
      unit: manual.unit,
      weightage: manual.weightage,
      resource_required: manual.resource_required,
      productivity_rate: manual.planned_duration > 0 ? manual.planned_quantity / manual.planned_duration : 0
    }, manual.predecessor_id ? {
      id: manual.predecessor_id,
      type: manual.dependency_type,
      lag: manual.lag
    } : undefined);
    setManual({
      wbs_code: '', name: '', baseline_start: project.start_date,
      planned_duration: 30, planned_quantity: 1, unit: 'Pkg', weightage: 1,
      resource_required: '', predecessor_id: '', dependency_type: 'FS', lag: 0
    });
    setShowAddActivity(false);
  };

  const handleGenerateTender = async (event: React.FormEvent) => {
    event.preventDefault();
    if (tenderText.trim().length < 30) return setTenderMessage('Paste at least one meaningful BOQ or tender paragraph.');
    setTenderBusy(true);
    setTenderMessage('');
    try {
      const result = await generateWbsFromTender(tenderText.trim(), project.start_date);
      setTenderResult(result);
      setTenderMessage(`Draft ready: ${result.activities.length} BOQ work items and ${result.dependencies.length} predecessor links.`);
    } catch (error) {
      setTenderMessage(error instanceof Error ? error.message : 'Could not generate the BOQ schedule.');
    } finally {
      setTenderBusy(false);
    }
  };

  const applyTenderSchedule = async () => {
    if (!tenderResult || activities.length > 0) return;
    setTenderBusy(true);
    setTenderMessage('Saving generated BOQ schedule…');
    try {
      await onImportTender(tenderResult);
      setTenderMessage('Generated BOQ schedule saved to the shared project workspace.');
      setTenderText('');
      setTenderResult(null);
      setShowTenderImport(false);
    } catch (error) {
      setTenderMessage(error instanceof Error ? error.message : 'Could not save the generated schedule.');
    } finally {
      setTenderBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Interactive controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 border border-slate-200/90 rounded-2xl shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 text-sm">📅</span>
            <h2 className="text-slate-900 text-base font-bold">BOQ & Work Schedule</h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
              {activities.length} work items
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {activities.filter(a => a.is_critical).length} on critical path · Date and dependency calculations run automatically.
          </p>
        </div>
        
        {isEditable && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => { setShowAddActivity(!showAddActivity); setShowAddDep(false); setShowTenderImport(false); }}
              className={`px-3.5 py-2 text-xs font-semibold rounded-xl shadow-xs transition flex items-center gap-1.5 ${
                showAddActivity 
                  ? 'bg-slate-100 text-slate-700 border border-slate-300' 
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              {showAddActivity ? '✕ Cancel' : '+ Add BOQ Work Item'}
            </button>
            <button
              onClick={() => { setShowTenderImport(!showTenderImport); setShowAddActivity(false); setShowAddDep(false); }}
              className={`px-3.5 py-2 text-xs font-semibold rounded-xl shadow-xs transition flex items-center gap-1.5 ${
                showTenderImport 
                  ? 'bg-slate-100 text-slate-700 border border-slate-300' 
                  : 'bg-purple-600 hover:bg-purple-700 text-white'
              }`}
            >
              {showTenderImport ? '✕ Cancel' : '✨ Build BOQ from Tender'}
            </button>
            <button
              onClick={() => { setShowAddDep(!showAddDep); setShowAddActivity(false); setShowTenderImport(false); }}
              className={`px-3.5 py-2 text-xs font-semibold rounded-xl shadow-xs transition flex items-center gap-1.5 ${
                showAddDep 
                  ? 'bg-slate-100 text-slate-700 border border-slate-300' 
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {showAddDep ? '✕ Cancel' : '🔗 Add Predecessor Link'}
            </button>
          </div>
        )}
      </div>

      {showTenderImport && isEditable && (
        <form onSubmit={handleGenerateTender} className="space-y-4 rounded-2xl border border-purple-200 bg-white p-5 shadow-xs">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <span className="text-purple-600">✨</span> Tender / BOQ Schedule Builder
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Paste BOQ descriptions or tender scope. The service uses configured AI when available and a construction-rule fallback when offline. Review the draft before saving.
            </p>
          </div>
          <textarea
            required
            rows={6}
            value={tenderText}
            onChange={event => setTenderText(event.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white p-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-purple-600 focus:ring-1 focus:ring-purple-600 outline-none"
            placeholder="Example: Item 1 site establishment; Item 2 excavation in soil 12,000 m3; Item 3 PCC bedding 450 m3; Item 4 RCC foundation…"
          />
          <div className="flex flex-wrap gap-2">
            <button
              disabled={tenderBusy}
              className="rounded-xl bg-purple-600 hover:bg-purple-700 px-4 py-2 text-xs font-bold text-white shadow-xs transition disabled:opacity-60"
            >
              {tenderBusy ? 'Generating…' : 'Generate BOQ Draft'}
            </button>
            {tenderResult && (
              <button
                type="button"
                disabled={tenderBusy}
                onClick={() => void applyTenderSchedule()}
                className="rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow-xs transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                Review and Safely Import BOQ Schedule
              </button>
            )}
          </div>
          {tenderMessage && (
            <div className="rounded-xl bg-purple-50 border border-purple-200 p-3 text-xs font-medium text-purple-900">
              {tenderMessage}
            </div>
          )}
          {activities.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              This project already has BOQ work. Import adds new items and updates only deterministic matches; it never removes existing BOQ items, activities, links, daily records, or finance records.
            </div>
          )}
          {tenderResult && (
            <div className="max-h-64 overflow-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <tr>
                    <th className="p-2.5">BOQ</th>
                    <th className="p-2.5">Description of work</th>
                    <th className="p-2.5">Duration</th>
                    <th className="p-2.5">Quantity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tenderResult.activities.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50/70">
                      <td className="p-2.5 font-mono text-slate-600">{item.wbs_code}</td>
                      <td className="p-2.5 font-semibold text-slate-900">{item.name}</td>
                      <td className="p-2.5 text-slate-700">{item.planned_duration} days</td>
                      <td className="p-2.5 text-slate-700">{item.planned_quantity} {item.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </form>
      )}

      {showAddActivity && (
        <form onSubmit={handleAddActivity} className="bg-white border border-slate-200/90 p-5 rounded-2xl space-y-4 shadow-xs">
          <div>
            <h3 className="text-slate-900 text-sm font-bold">Manual BOQ Work Entry</h3>
            <p className="text-slate-500 text-xs">Add the BOQ item number, description, date, duration, quantity and predecessor.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
            <Control label="BOQ Item No.">
              <input required placeholder="e.g. 03.02" value={manual.wbs_code} onChange={e => setManual({...manual, wbs_code: e.target.value})} />
            </Control>
            <Control label="Description of Work">
              <input required placeholder="Foundation excavation" value={manual.name} onChange={e => setManual({...manual, name: e.target.value})} />
            </Control>
            <Control label="Baseline Start (BS)">
              <BsDatePicker required value={manual.baseline_start} onChange={baseline_start => setManual({...manual, baseline_start})} />
            </Control>
            <Control label="Duration (days)">
              <input type="number" min="1" required value={manual.planned_duration} onChange={e => setManual({...manual, planned_duration: Number(e.target.value)})} />
            </Control>
            <Control label="Planned Quantity">
              <input type="number" min="0" step="any" value={manual.planned_quantity} onChange={e => setManual({...manual, planned_quantity: Number(e.target.value)})} />
            </Control>
            <Control label="Unit">
              <input value={manual.unit} onChange={e => setManual({...manual, unit: e.target.value})} />
            </Control>
            <Control label="Weightage %">
              <input type="number" min="0" max="100" step="0.1" value={manual.weightage} onChange={e => setManual({...manual, weightage: Number(e.target.value)})} />
            </Control>
            <Control label="Resource / Crew">
              <input value={manual.resource_required} onChange={e => setManual({...manual, resource_required: e.target.value})} />
            </Control>
            <Control label="Predecessor (optional)">
              <select value={manual.predecessor_id} onChange={e => setManual({...manual, predecessor_id: e.target.value})}>
                <option value="">No predecessor</option>
                {activities.map(a => <option key={a.id} value={a.id}>{a.wbs_code} — {a.name}</option>)}
              </select>
            </Control>
            <Control label="Relationship">
              <select value={manual.dependency_type} onChange={e => setManual({...manual, dependency_type: e.target.value as Dependency['type']})}>
                {['FS','SS','FF','SF'].map(type => <option key={type}>{type}</option>)}
              </select>
            </Control>
            <Control label="Lag / Lead (days)">
              <input type="number" placeholder="Use -2 for lead" value={manual.lag || ''} onChange={e => setManual({...manual, lag: Number(e.target.value)})} />
            </Control>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowAddActivity(false)} className="px-4 py-2 border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl shadow-xs transition">
              Save Work Item & Recalculate
            </button>
          </div>
        </form>
      )}

      {/* Add Dependency Panel */}
      {showAddDep && (
        <form onSubmit={handleSubmitDep} className="bg-white border border-slate-200/90 p-5 rounded-2xl space-y-4 max-w-xl shadow-xs">
          <h3 className="text-slate-900 text-xs font-bold uppercase tracking-wider">Create Activity Predecessor Link</h3>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-slate-600 mb-1 font-semibold">Predecessor (First)</label>
              <select 
                value={predId} 
                onChange={(e) => setPredId(e.target.value)}
                className="w-full bg-white border border-slate-300 p-2 rounded-xl text-slate-900"
                required
              >
                <option value="">Select Predecessor...</option>
                {activities.map(a => <option key={a.id} value={a.id}>{a.wbs_code} - {a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-slate-600 mb-1 font-semibold">Successor (Next)</label>
              <select 
                value={succId} 
                onChange={(e) => setSuccId(e.target.value)}
                className="w-full bg-white border border-slate-300 p-2 rounded-xl text-slate-900"
                required
              >
                <option value="">Select Successor...</option>
                {activities.map(a => <option key={a.id} value={a.id}>{a.wbs_code} - {a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-slate-600 mb-1 font-semibold">Dependency Type</label>
              <select 
                value={depType} 
                onChange={(e) => setDepType(e.target.value as any)}
                className="w-full bg-white border border-slate-300 p-2 rounded-xl text-slate-900"
              >
                <option value="FS">Finish to Start (FS)</option>
                <option value="SS">Start to Start (SS)</option>
                <option value="FF">Finish to Finish (FF)</option>
                <option value="SF">Start to Finish (SF)</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-600 mb-1 font-semibold">Lag / Lead Days</label>
              <input 
                type="number" 
                value={lagDays} 
                onChange={(e) => setLagDays(Number(e.target.value))}
                placeholder="0 or negative for lead"
                className="w-full bg-white border border-slate-300 p-2 rounded-xl text-slate-900"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowAddDep(false)} className="px-3 py-1.5 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl hover:bg-slate-50 transition">
              Cancel
            </button>
            <button type="submit" className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition">
              Save Dependency Link
            </button>
          </div>
        </form>
      )}

      {/* Gantt Timeline Rendering */}
      <div className="bg-white border border-slate-200/90 p-5 rounded-2xl shadow-xs overflow-x-auto">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-50 text-blue-600 text-xs">📊</span>
            <h3 className="text-slate-900 text-sm font-bold uppercase tracking-wider">Gantt Chart (Baseline vs Forecast Timeline)</h3>
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
            delayedActivities.length ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${delayedActivities.length ? 'bg-rose-500' : 'bg-emerald-500'}`} />
            {delayedActivities.length ? `${delayedActivities.length} delayed activities require remarks` : 'Programme currently within baseline'}
          </span>
        </div>
        
        {/* Gantt Area */}
        <div className="min-w-[800px] select-none text-xs">
          {/* Timeline Dates Header */}
          <div className="flex border-b border-slate-200 pb-2 mb-2 font-semibold text-slate-500">
            <div className="w-1/3">BOQ Item / Description of Work</div>
            <div className="w-2/3 relative h-6">
              <span className="absolute left-[0%]">2025</span>
              <span className="absolute left-[33%]">2026</span>
              <span className="absolute left-[66%]">2027</span>
              <span className="absolute right-[0%]">End</span>
            </div>
          </div>

          {/* Activity Timeline Rows */}
          <div className="space-y-3">
            {activities.map(act => {
              const delay = delayDetails(act);
              const startOffset = getPercentOffset(act.early_start || act.baseline_start);
              const durationWidth = getPercentWidth(
                act.early_start || act.baseline_start,
                act.early_finish || act.baseline_finish
              );
              
              const baseStartOffset = getPercentOffset(act.baseline_start);
              const baseWidth = getPercentWidth(act.baseline_start, act.baseline_finish);

              // Determine bar colors based on criticality and completion
              let barColor = 'bg-blue-500';
              if (act.status === 'completed') barColor = 'bg-emerald-500';
              else if (act.is_critical) barColor = 'bg-rose-500';
              else if (act.is_near_critical) barColor = 'bg-amber-500';

              return (
                <div key={act.id} className={`flex items-center py-2 px-2 rounded-xl transition ${delay.delayDays > 0 ? 'bg-rose-50/60 hover:bg-rose-100/50' : 'hover:bg-slate-50'}`}>
                  {/* WBS info column */}
                  <div className="w-1/3 pr-4 flex flex-col">
                    <span className="font-semibold text-slate-900 truncate">{act.wbs_code} - {act.name}</span>
                    <div className="flex justify-between text-[10px] text-slate-500">
                      <span>Float: {act.total_float}d</span>
                      <span className="capitalize">{act.status.replace('_', ' ')}</span>
                      <span>{act.planned_quantity} {act.unit}</span>
                    </div>
                    <span className={`mt-0.5 text-[10px] font-medium ${delay.delayDays > 0 ? 'text-rose-700' : 'text-slate-500'}`}>{delay.remark}</span>
                  </div>

                  {/* SVG Bar Visualizations */}
                  <div className="w-2/3 relative h-7 bg-slate-100 rounded-lg border border-slate-200 overflow-hidden">
                    {/* Baseline Bar (Gray Outline/Stripe) */}
                    <div 
                      className="absolute h-1.5 bg-slate-400 rounded-full top-[3px]"
                      style={{ left: `${baseStartOffset}%`, width: `${baseWidth}%` }}
                      title={`Baseline: ${formatBsDate(act.baseline_start)} to ${formatBsDate(act.baseline_finish)}`}
                    />
                    
                    {/* Actual/Forecast Bar (Main colored bar) */}
                    <div 
                      className={`absolute h-2.5 rounded-full bottom-[3px] shadow-xs ${barColor}`}
                      style={{ left: `${startOffset}%`, width: `${durationWidth}%` }}
                      title={`Forecast: ${formatBsDate(act.early_start)} to ${formatBsDate(act.early_finish)}`}
                    >
                      {/* Show completion shading inside bar */}
                      {act.status === 'in_progress' && (
                        <div 
                          className="bg-emerald-400/40 h-full rounded-full"
                          style={{ width: `${activityActualProgress(act)}%` }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap gap-4 text-[10px] text-slate-600 mt-4 justify-end border-t border-slate-100 pt-3">
          <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 bg-slate-400 rounded-full inline-block"></span> Baseline Target</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-2.5 bg-blue-500 rounded-full inline-block"></span> Planned / Future</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-2.5 bg-rose-500 rounded-full inline-block"></span> Critical Path</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-2.5 bg-amber-500 rounded-full inline-block"></span> Near Critical (Float &le; 7 days)</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-2.5 bg-emerald-500 rounded-full inline-block"></span> Completed Work</span>
        </div>
      </div>

      {/* CPM Grid Tables */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-slate-900 text-base font-bold">BOQ Work Schedule Register</h3>
            <p className="text-xs text-slate-500">Authorized programme with critical-path calculation, floats, and delay remarks.</p>
          </div>
          <span className="text-xs font-semibold text-slate-500">
            Total items: {activities.length}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 font-semibold">
                <th className="py-2.5 px-3">BOQ Item</th>
                <th className="py-2.5 px-3">Description of Work</th>
                <th className="py-2.5 px-3 text-right">Duration</th>
                <th className="py-2.5 px-3 text-right">Qty / Unit</th>
                <th className="py-2.5 px-3 text-right">Early Start (BS)</th>
                <th className="py-2.5 px-3 text-right">Early Finish (BS)</th>
                <th className="py-2.5 px-3 text-right">Late Start (BS)</th>
                <th className="py-2.5 px-3 text-right">Late Finish (BS)</th>
                <th className="py-2.5 px-3 text-right">Float</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3">Delay / Management Remark</th>
                {isEditable && <th className="py-2.5 px-3 text-right">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {activities.map(act => {
                const isEditing = editingActId === act.id;
                const delay = delayDetails(act);
                
                let statusPillClass = 'status-pill-neutral';
                let statusLabel = 'NOT STARTED';
                if (act.status === 'completed') {
                  statusPillClass = 'status-pill-completed';
                  statusLabel = 'COMPLETED';
                } else if (act.status === 'in_progress') {
                  statusPillClass = 'status-pill-progress';
                  statusLabel = 'IN PROGRESS';
                }
                if (delay.delayDays > 0 && act.status !== 'completed') {
                  statusPillClass = 'status-pill-delayed';
                  statusLabel = 'DELAYED';
                }

                return (
                  <tr key={act.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2.5 px-3 font-mono font-medium text-slate-600">
                      {isEditing ? (
                        <input value={editAct.wbs_code || ''} onChange={e => setEditAct({...editAct, wbs_code: e.target.value})} className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                      ) : act.wbs_code}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900">
                      {isEditing ? (
                        <input value={editAct.name || ''} onChange={e => setEditAct({...editAct, name: e.target.value})} className="w-52 rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                      ) : act.name}
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium text-slate-700">
                      {isEditing ? (
                        <input 
                          type="number" 
                          value={editAct.planned_duration || ''}
                          onChange={(e) => setEditAct({...editAct, planned_duration: Number(e.target.value)})}
                          className="w-16 rounded-lg border border-slate-300 text-right px-2 py-1 text-xs"
                        />
                      ) : (
                        `${act.planned_duration}d`
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-700">
                      {isEditing ? (
                        <div className="flex justify-end gap-1">
                          <input type="number" value={editAct.planned_quantity || ''} onChange={(e) => setEditAct({...editAct, planned_quantity: Number(e.target.value)})} className="w-20 rounded-lg border border-slate-300 text-right px-2 py-1 text-xs" />
                          <input value={editAct.unit || ''} onChange={(e) => setEditAct({...editAct, unit: e.target.value})} className="w-14 rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                        </div>
                      ) : (
                        `${act.planned_quantity} ${act.unit}`
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                      {isEditing ? <BsDatePicker value={String(editAct.baseline_start || act.baseline_start)} onChange={baseline_start => setEditAct({...editAct, baseline_start})} className="min-w-36" /> : formatBsDate(act.early_start)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                      {isEditing ? <BsDatePicker value={String(editAct.baseline_finish || act.baseline_finish)} onChange={baseline_finish => setEditAct({...editAct, baseline_finish})} className="min-w-36" /> : formatBsDate(act.early_finish)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-500">{formatBsDate(act.late_start)}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-500">{formatBsDate(act.late_finish)}</td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                        (act.total_float ?? 0) <= 0 
                          ? 'bg-rose-50 text-rose-700 border border-rose-200' 
                          : 'text-slate-600 bg-slate-100'
                      }`}>
                        {act.total_float}d
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {isEditing ? (
                        <select value={editAct.status || act.status} onChange={e => setEditAct({...editAct, status: e.target.value as Activity['status']})} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">
                          <option value="not_started">not started</option>
                          <option value="in_progress">in progress</option>
                          <option value="completed">completed</option>
                        </select>
                      ) : (
                        <span className={`status-pill ${statusPillClass}`}>
                          <span className="status-pill-dot" />
                          {statusLabel}
                        </span>
                      )}
                    </td>
                    <td className={`py-2.5 px-3 max-w-[240px] text-xs ${delay.delayDays > 0 ? 'font-semibold text-rose-700' : 'text-slate-500'}`}>
                      {delay.remark}
                    </td>
                    {isEditable && (
                      <td className="py-2.5 px-3 text-right pr-2">
                        {isEditing ? (
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => handleSaveEdit(act)} className="text-emerald-700 hover:text-emerald-800 font-bold">Save</button>
                            <button onClick={() => setEditingActId(null)} className="text-slate-500 hover:text-slate-700 font-medium">Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => handleStartEdit(act)} className="text-blue-600 hover:text-blue-700 font-semibold">Edit</button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dependencies list */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-slate-900 text-base font-bold">Work Dependencies & Predecessor Links</h3>
            <p className="text-xs text-slate-500">Predecessor logic driving CPM critical path calculations and early/late date float.</p>
          </div>
          <span className="text-xs font-semibold text-slate-500">
            {dependencies.length} active links
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {dependencies.map(d => {
            const pred = activities.find(a => a.id === d.predecessor_id);
            const succ = activities.find(a => a.id === d.successor_id);
            if (!pred || !succ) return null;
            return (
              <div key={d.id} className="border border-slate-200 bg-slate-50/70 p-3.5 rounded-xl flex items-center justify-between text-xs hover:border-blue-200 hover:bg-blue-50/30 transition">
                <div className="flex flex-col">
                  <div className="flex items-center gap-2 text-slate-900 font-semibold">
                    <span className="font-mono text-slate-700">{pred.wbs_code}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-md">{d.type}</span>
                    <span className="font-mono text-slate-700">{succ.wbs_code}</span>
                  </div>
                  <span className="text-[11px] text-slate-500 truncate max-w-[200px] mt-1">
                    {pred.name.substring(0, 20)}... → {succ.name.substring(0, 20)}...
                  </span>
                  {d.lag !== 0 && (
                    <span className="text-[10px] font-semibold text-amber-700 mt-0.5">
                      Lag: {d.lag} day{d.lag === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
                {isEditable && (
                  <button 
                    onClick={() => onDeleteDependency(d.id)}
                    className="text-rose-600 hover:text-rose-700 text-xs px-2.5 py-1 rounded-lg border border-rose-200 bg-white hover:bg-rose-50 transition font-medium"
                  >
                    Delete
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Control({label,children}:{label:string;children:React.ReactNode}) {
  return (
    <label className="space-y-1 text-slate-600">
      <span className="block font-medium text-xs">{label}</span>
      <span className="[&_input]:w-full [&_select]:w-full [&_input]:p-2 [&_select]:p-2 [&_input]:rounded-xl [&_select]:rounded-xl [&_input]:border [&_select]:border [&_input]:border-slate-300 [&_select]:border-slate-300 [&_input]:bg-white [&_select]:bg-white [&_input]:text-slate-900 [&_select]:text-slate-900 [&_input]:text-xs [&_select]:text-xs">
        {children}
      </span>
    </label>
  );
}
