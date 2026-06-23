// CPM Timeline and WBS Dashboard Component (Page 2)
import React, { useState } from 'react';
import { Activity, Dependency, diffDays, addDays } from '../lib/cpm';

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
  userRole
}: CpmTimelineDashboardProps) {
  const [showAddDep, setShowAddDep] = useState(false);
  const [showAddActivity, setShowAddActivity] = useState(false);
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
  const [editDur, setEditDur] = useState(0);
  const [editQty, setEditQty] = useState(0);

  const isEditable = ['project_director', 'project_manager', 'planning_engineer'].includes(userRole);
  const today = new Date().toISOString().slice(0, 10);
  const delayDetails = (act: Activity) => {
    const forecastFinish = act.early_finish || act.baseline_finish;
    const forecastDelay = Math.max(0, diffDays(act.baseline_finish, forecastFinish));
    const overdueDays = act.status === 'completed' ? 0 : Math.max(0, diffDays(act.baseline_finish, today));
    const delayDays = Math.max(forecastDelay, overdueDays);
    const progress = act.planned_quantity > 0 ? (act.actual_quantity / act.planned_quantity) * 100 : 0;
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
    setEditDur(act.planned_duration);
    setEditQty(act.planned_quantity);
  };

  const handleSaveEdit = (act: Activity) => {
    onUpdateActivity({
      ...act,
      planned_duration: editDur,
      planned_quantity: editQty
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

  return (
    <div className="space-y-6">
      {/* Interactive controls */}
      <div className="flex justify-between items-center bg-slate-800/40 p-4 border border-slate-700/30 rounded-xl shadow">
        <div>
          <h2 className="text-slate-200 text-base font-semibold">WBS & Critical Path Method (CPM) Schedule</h2>
          <p className="text-xs text-slate-400">Total Activities: {activities.length} | Critical Path: {activities.filter(a => a.is_critical).length} Activities</p>
        </div>
        
        {isEditable && <div className="flex flex-wrap gap-2">
          <button onClick={() => { setShowAddActivity(!showAddActivity); setShowAddDep(false); }} className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow transition">
            {showAddActivity ? 'Cancel' : '+ Add WBS Activity Manually'}
          </button>
          <button onClick={() => { setShowAddDep(!showAddDep); setShowAddActivity(false); }} className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow transition">
            {showAddDep ? 'Cancel' : '🔗 Add Predecessor Link'}
          </button>
        </div>}
      </div>

      {showAddActivity && (
        <form onSubmit={handleAddActivity} className="bg-white border border-slate-700 p-4 rounded-xl space-y-4 shadow-lg">
          <div>
            <h3 className="text-slate-200 text-sm font-semibold">Manual WBS / Activity Entry</h3>
            <p className="text-slate-400 text-xs">Use this for direct planning entry. The AI Tender WBS Scanner remains available in AI Assistant for bulk generation.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
            <Control label="WBS Code"><input required placeholder="e.g. 03.02" value={manual.wbs_code} onChange={e=>setManual({...manual,wbs_code:e.target.value})}/></Control>
            <Control label="Activity Name"><input required placeholder="Foundation excavation" value={manual.name} onChange={e=>setManual({...manual,name:e.target.value})}/></Control>
            <Control label="Baseline Start"><input type="date" required value={manual.baseline_start} onChange={e=>setManual({...manual,baseline_start:e.target.value})}/></Control>
            <Control label="Duration (days)"><input type="number" min="1" required value={manual.planned_duration} onChange={e=>setManual({...manual,planned_duration:Number(e.target.value)})}/></Control>
            <Control label="Planned Quantity"><input type="number" min="0" step="any" value={manual.planned_quantity} onChange={e=>setManual({...manual,planned_quantity:Number(e.target.value)})}/></Control>
            <Control label="Unit"><input value={manual.unit} onChange={e=>setManual({...manual,unit:e.target.value})}/></Control>
            <Control label="Weightage %"><input type="number" min="0" max="100" step="0.1" value={manual.weightage} onChange={e=>setManual({...manual,weightage:Number(e.target.value)})}/></Control>
            <Control label="Resource / Crew"><input value={manual.resource_required} onChange={e=>setManual({...manual,resource_required:e.target.value})}/></Control>
            <Control label="Predecessor (optional)"><select value={manual.predecessor_id} onChange={e=>setManual({...manual,predecessor_id:e.target.value})}><option value="">No predecessor</option>{activities.map(a=><option key={a.id} value={a.id}>{a.wbs_code} — {a.name}</option>)}</select></Control>
            <Control label="Relationship"><select value={manual.dependency_type} onChange={e=>setManual({...manual,dependency_type:e.target.value as Dependency['type']})}>{['FS','SS','FF','SF'].map(type=><option key={type}>{type}</option>)}</select></Control>
            <Control label="Lag / Lead"><input type="number" value={manual.lag} onChange={e=>setManual({...manual,lag:Number(e.target.value)})}/></Control>
          </div>
          <button className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg">Save Activity & Recalculate CPM</button>
        </form>
      )}

      {/* Add Dependency Panel */}
      {showAddDep && (
        <form onSubmit={handleSubmitDep} className="bg-slate-800/80 border border-slate-700 p-4 rounded-xl space-y-4 max-w-xl shadow-lg">
          <h3 className="text-slate-200 text-xs font-bold uppercase tracking-wider">Create Activity Predecessor Link</h3>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">Predecessor (First)</label>
              <select 
                value={predId} 
                onChange={(e) => setPredId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-slate-200"
                required
              >
                <option value="">Select Predecessor...</option>
                {activities.map(a => <option key={a.id} value={a.id}>{a.wbs_code} - {a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Successor (Next)</label>
              <select 
                value={succId} 
                onChange={(e) => setSuccId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-slate-200"
                required
              >
                <option value="">Select Successor...</option>
                {activities.map(a => <option key={a.id} value={a.id}>{a.wbs_code} - {a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Dependency Type</label>
              <select 
                value={depType} 
                onChange={(e) => setDepType(e.target.value as any)}
                className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-slate-200"
              >
                <option value="FS">Finish to Start (FS)</option>
                <option value="SS">Start to Start (SS)</option>
                <option value="FF">Finish to Finish (FF)</option>
                <option value="SF">Start to Finish (SF)</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Lag / Lead Days (Negative for Lead)</label>
              <input 
                type="number" 
                value={lagDays} 
                onChange={(e) => setLagDays(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-slate-200"
              />
            </div>
          </div>
          <button type="submit" className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded shadow transition">
            Save Dependency Link
          </button>
        </form>
      )}

      {/* Gantt Timeline Rendering */}
      <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-lg overflow-x-auto">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <h3 className="text-slate-800 text-sm font-bold uppercase tracking-wider">Gantt Chart (Baseline vs Forecast Timeline)</h3>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${delayedActivities.length ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
            {delayedActivities.length ? `${delayedActivities.length} delayed activities require remarks` : 'Programme currently within baseline'}
          </span>
        </div>
        
        {/* Gantt Area */}
        <div className="min-w-[800px] select-none text-xs">
          {/* Timeline Dates Header */}
          <div className="flex border-b border-slate-200 pb-2 mb-2 font-semibold text-slate-600">
            <div className="w-1/3">WBS Activity Name</div>
            <div className="w-2/3 relative h-6">
              <span className="absolute left-[0%]">2025</span>
              <span className="absolute left-[33%]">2026</span>
              <span className="absolute left-[66%]">2027</span>
              <span className="absolute right-[0%]">End</span>
            </div>
          </div>

          {/* Activity Timeline Rows */}
          <div className="space-y-4">
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
              let barColor = 'bg-sky-500'; // Default planned
              if (act.status === 'completed') barColor = 'bg-emerald-500';
              else if (act.is_critical) barColor = 'bg-red-500';
              else if (act.is_near_critical) barColor = 'bg-amber-500';

              return (
                <div key={act.id} className={`flex items-center py-2 rounded transition ${delay.delayDays > 0 ? 'bg-rose-50 hover:bg-rose-100' : 'hover:bg-blue-50'}`}>
                  {/* WBS info column */}
                  <div className="w-1/3 pr-4 flex flex-col">
                    <span className="font-semibold text-slate-200 truncate">{act.wbs_code} - {act.name}</span>
                    <div className="flex justify-between text-[10px] text-slate-500">
                      <span>Float: {act.total_float}d</span>
                      <span>{act.status.replace('_', ' ')}</span>
                      <span>{act.planned_quantity} {act.unit}</span>
                    </div>
                    <span className={`mt-1 text-[10px] font-semibold ${delay.delayDays > 0 ? 'text-rose-700' : 'text-slate-500'}`}>{delay.remark}</span>
                  </div>

                  {/* SVG Bar Visualizations */}
                  <div className="w-2/3 relative h-8 bg-slate-50 rounded border border-slate-200 overflow-hidden">
                    {/* Baseline Bar (Gray Outline/Stripe) */}
                    <div 
                      className="absolute h-1.5 bg-slate-700/60 rounded top-[4px]"
                      style={{ left: `${baseStartOffset}%`, width: `${baseWidth}%` }}
                      title={`Baseline: ${act.baseline_start} to ${act.baseline_finish}`}
                    ></div>
                    
                    {/* Actual/Forecast Bar (Main colored bar) */}
                    <div 
                      className={`absolute h-3 rounded bottom-[4px] opacity-90 ${barColor}`}
                      style={{ left: `${startOffset}%`, width: `${durationWidth}%` }}
                      title={`Forecast: ${act.early_start} to ${act.early_finish}`}
                    >
                      {/* Show completion shading inside bar */}
                      {act.status === 'in_progress' && (
                        <div 
                          className="bg-emerald-400/30 h-full"
                          style={{ width: `${(act.actual_quantity / (act.planned_quantity || 1)) * 100}%` }}
                        ></div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap gap-4 text-[10px] text-slate-600 mt-4 justify-end border-t border-slate-200 pt-2">
          <span className="flex items-center gap-1"><span className="w-3 h-1.5 bg-slate-700 rounded inline-block"></span> Baseline Target</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-sky-500 rounded inline-block"></span> Planned / Future</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-500 rounded inline-block"></span> Critical Path</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-amber-500 rounded inline-block"></span> Near Critical (Float &lt;= 7 days)</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-emerald-500 rounded inline-block"></span> Completed Work</span>
        </div>
      </div>

      {/* CPM Grid Tables */}
      <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-5 shadow-lg">
        <h3 className="text-slate-200 text-sm font-semibold mb-4">CPM Scheduled Activities Register</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400 font-semibold">
                <th className="pb-3">WBS</th>
                <th className="pb-3">Activity Name</th>
                <th className="pb-3 text-right">Planned Dur</th>
                <th className="pb-3 text-right">Early Start</th>
                <th className="pb-3 text-right">Early Finish</th>
                <th className="pb-3 text-right">Late Start</th>
                <th className="pb-3 text-right">Late Finish</th>
                <th className="pb-3 text-right">Float</th>
                <th className="pb-3 text-center">Status</th>
                <th className="pb-3">Delay / Management Remark</th>
                {isEditable && <th className="pb-3 text-right pr-2">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {activities.map(act => {
                const isEditing = editingActId === act.id;
                const delay = delayDetails(act);
                return (
                  <tr key={act.id} className="hover:bg-slate-800/10">
                    <td className="py-2.5 font-mono text-slate-400">{act.wbs_code}</td>
                    <td className="py-2.5 font-semibold text-slate-100">{act.name}</td>
                    <td className="py-2.5 text-right">
                      {isEditing ? (
                        <input 
                          type="number" 
                          value={editDur}
                          onChange={(e) => setEditDur(Number(e.target.value))}
                          className="w-16 bg-slate-900 border border-slate-700 rounded text-right px-1"
                        />
                      ) : (
                        `${act.planned_duration}d`
                      )}
                    </td>
                    <td className="py-2.5 text-right font-mono">{act.early_start}</td>
                    <td className="py-2.5 text-right font-mono">{act.early_finish}</td>
                    <td className="py-2.5 text-right font-mono">{act.late_start}</td>
                    <td className="py-2.5 text-right font-mono">{act.late_finish}</td>
                    <td className="py-2.5 text-right font-mono">
                      <span className={`px-1 py-0.5 rounded font-bold ${act.total_float! <= 0 ? 'bg-red-500/10 text-red-400' : 'text-slate-400'}`}>
                        {act.total_float}d
                      </span>
                    </td>
                    <td className="py-2.5 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold ${
                        act.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' :
                        act.status === 'in_progress' ? 'bg-sky-500/10 text-sky-400' :
                        'bg-slate-700/30 text-slate-400'
                      }`}>
                        {act.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className={`py-2.5 max-w-[260px] ${delay.delayDays > 0 ? 'font-semibold text-rose-700' : 'text-slate-500'}`}>{delay.remark}</td>
                    {isEditable && (
                      <td className="py-2.5 text-right pr-2">
                        {isEditing ? (
                          <div className="flex gap-1 justify-end">
                            <button onClick={() => handleSaveEdit(act)} className="text-emerald-400 hover:text-emerald-300 font-bold">Save</button>
                            <button onClick={() => setEditingActId(null)} className="text-slate-400 hover:text-slate-300">Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => handleStartEdit(act)} className="text-blue-400 hover:text-blue-300 font-semibold">Edit</button>
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
      <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-5 shadow-lg">
        <h3 className="text-slate-200 text-sm font-semibold mb-3">CPM Network Logic (Dependencies)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {dependencies.map(d => {
            const pred = activities.find(a => a.id === d.predecessor_id);
            const succ = activities.find(a => a.id === d.successor_id);
            if (!pred || !succ) return null;
            return (
              <div key={d.id} className="border border-slate-700/40 bg-slate-900/20 p-2.5 rounded-lg flex items-center justify-between text-xs">
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5 text-slate-300 font-semibold">
                    <span>{pred.wbs_code}</span>
                    <span className="text-[10px] px-1 bg-slate-800 text-slate-400 rounded">{d.type}</span>
                    <span>{succ.wbs_code}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 truncate max-w-[200px] mt-0.5">
                    {pred.name.substring(0,18)}... → {succ.name.substring(0,18)}...
                  </span>
                  {d.lag !== 0 && <span className="text-[9px] text-amber-500 mt-0.5">Lag: {d.lag}d</span>}
                </div>
                {isEditable && (
                  <button 
                    onClick={() => onDeleteDependency(d.id)}
                    className="text-rose-500 hover:text-rose-400 text-xs px-2 py-1 bg-rose-500/5 hover:bg-rose-500/10 rounded transition"
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
  return <label className="space-y-1 text-slate-500"><span className="block font-medium">{label}</span><span className="[&_input]:w-full [&_select]:w-full [&_input]:p-2.5 [&_select]:p-2.5 [&_input]:rounded-lg [&_select]:rounded-lg [&_input]:border [&_select]:border [&_input]:border-slate-700 [&_select]:border-slate-700">{children}</span></label>;
}
