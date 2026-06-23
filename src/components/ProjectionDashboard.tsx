// Projections and Schedule Recovery Dashboard (Page 4)
import React from 'react';
import { Activity } from '../lib/cpm';
import { EVMMetrics } from '../lib/evm';
import { calculateActivityRiskScore, RiskScoreDetails } from '../lib/evm';
import { formatDate } from '../lib/cpm';

interface ProjectionDashboardProps {
  project: any;
  activities: Activity[];
  evm: EVMMetrics;
  designPackages: any[];
  risks: any[];
  currentDate: string;
}

export default function ProjectionDashboard({
  project,
  activities,
  evm,
  designPackages,
  risks,
  currentDate
}: ProjectionDashboardProps) {
  // Projected Completion
  let calculatedFinish = project.target_completion_date;
  activities.forEach(a => {
    if (a.early_finish && a.early_finish > calculatedFinish) {
      calculatedFinish = a.early_finish;
    }
  });

  const finishDiff = Math.ceil((new Date(calculatedFinish).getTime() - new Date(project.target_completion_date).getTime()) / (1000 * 3600 * 24));
  const delayDays = Math.max(0, finishDiff);

  // Recovery Rate Calculations
  const today = new Date(currentDate);
  const contractFinish = new Date(project.target_completion_date);
  const timeDiff = contractFinish.getTime() - today.getTime();
  const remainingPlannedDays = Math.max(1, Math.ceil(timeDiff / (1000 * 3600 * 24)));

  const remainingWorkPercent = 100 - evm.actualProgress;
  const requiredDailyProgress = remainingWorkPercent / remainingPlannedDays; // e.g. 0.15% per day
  const requiredWeeklyProgress = requiredDailyProgress * 7;

  // Current Progress rate
  // Find elapsed working days from project start
  const start = new Date(project.start_date);
  const elapsedDays = Math.max(1, Math.ceil((today.getTime() - start.getTime()) / (1000 * 3600 * 24)));
  const currentDailyProgress = evm.actualProgress / elapsedDays;
  const currentWeeklyProgress = currentDailyProgress * 7;

  const recoveryGap = requiredWeeklyProgress - currentWeeklyProgress;
  const recoveryRequiredMultiplier = currentWeeklyProgress > 0 ? (requiredWeeklyProgress / currentWeeklyProgress) - 1 : 0.5;

  // Probability of on-time completion
  let probability = 'High';
  let probColor = 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5';
  if (delayDays > 30) {
    probability = 'Critical Delay (Action Needed)';
    probColor = 'text-red-400 border-red-500/30 bg-red-500/5 animate-pulse';
  } else if (delayDays > 0) {
    probability = 'Medium Risk of Delay';
    probColor = 'text-amber-400 border-amber-500/20 bg-amber-500/5';
  }

  return (
    <div className="space-y-6">
      {/* Forecasting indicators */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Forecast Completion Details */}
        <div className="bg-slate-800/50 border border-slate-700/40 p-5 rounded-xl shadow-lg space-y-3">
          <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Completion Dates Analysis</h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between border-b border-slate-800 pb-1.5">
              <span className="text-slate-400">Contractual Completion:</span>
              <span className="font-semibold text-slate-200">{formatDate(project.target_completion_date)}</span>
            </div>
            <div className="flex justify-between border-b border-slate-800 pb-1.5">
              <span className="text-slate-400">Current Forecast:</span>
              <span className="font-semibold text-rose-400">{formatDate(calculatedFinish)}</span>
            </div>
            <div className="flex justify-between pb-1">
              <span className="text-slate-400">Delay Deviation:</span>
              <span className="font-bold text-rose-400">+{delayDays} Days</span>
            </div>
          </div>
          <div className={`border p-2.5 rounded-lg text-xs text-center font-bold mt-2 ${probColor}`}>
            On-Time Probability: {probability}
          </div>
        </div>

        {/* Required Recovery Rate */}
        <div className="bg-slate-800/50 border border-slate-700/40 p-5 rounded-xl shadow-lg space-y-3">
          <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Required Recovery Rates</h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between border-b border-slate-800 pb-1.5">
              <span className="text-slate-400">Remaining Contract Time:</span>
              <span className="font-semibold text-slate-200">{remainingPlannedDays} Calendar Days</span>
            </div>
            <div className="flex justify-between border-b border-slate-800 pb-1.5">
              <span className="text-slate-400">Remaining Progress Work:</span>
              <span className="font-semibold text-slate-200">{remainingWorkPercent.toFixed(1)}% of scope</span>
            </div>
            <div className="flex justify-between pb-1">
              <span className="text-slate-400">Required Weekly Rate:</span>
              <span className="font-bold text-sky-400">{requiredWeeklyProgress.toFixed(2)}% / week</span>
            </div>
          </div>
        </div>

        {/* Recovery Productivity Gap */}
        <div className="bg-slate-800/50 border border-slate-700/40 p-5 rounded-xl shadow-lg space-y-3">
          <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Productivity Rate Gap</h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between border-b border-slate-800 pb-1.5">
              <span className="text-slate-400">Current Weekly Progress Rate:</span>
              <span className="font-semibold text-slate-200">{currentWeeklyProgress.toFixed(2)}% / week</span>
            </div>
            <div className="flex justify-between border-b border-slate-800 pb-1.5">
              <span className="text-slate-400">Recovery Gap Deficit:</span>
              <span className="font-bold text-rose-400">+{recoveryGap.toFixed(2)}% / week</span>
            </div>
            <div className="flex justify-between pb-1">
              <span className="text-slate-400">Required Productivity Increase:</span>
              <span className="font-bold text-amber-400">+{Math.max(0, Math.round(recoveryRequiredMultiplier * 100))}% Crew Capacity</span>
            </div>
          </div>
        </div>
      </div>

      {/* Activity Risk Table */}
      <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-5 shadow-lg">
        <h3 className="text-slate-200 text-sm font-semibold mb-4">CPM Delay Risk Scores (Activity Level)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400 font-semibold">
                <th className="pb-3">WBS</th>
                <th className="pb-3">Activity Name</th>
                <th className="pb-3 text-right">Remaining Dur</th>
                <th className="pb-3 text-right">Risk Score</th>
                <th className="pb-3 text-center">Risk Category</th>
                <th className="pb-3 pl-4">Key Risk Drivers</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {activities.map(act => {
                const rScore = calculateActivityRiskScore(act, designPackages, risks);
                
                let badgeColor = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
                if (rScore.category === 'critical') badgeColor = 'bg-red-500/10 text-red-400 border-red-500/20 animate-pulse';
                else if (rScore.category === 'high') badgeColor = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
                else if (rScore.category === 'medium') badgeColor = 'bg-amber-500/10 text-amber-400 border-amber-500/20';

                return (
                  <tr key={act.id} className="hover:bg-slate-800/10">
                    <td className="py-2.5 font-mono text-slate-400">{act.wbs_code}</td>
                    <td className="py-2.5 font-semibold text-slate-100">{act.name}</td>
                    <td className="py-2.5 text-right font-mono">{act.status === 'completed' ? '0d' : `${act.remaining_duration || act.planned_duration}d`}</td>
                    <td className="py-2.5 text-right font-mono font-bold">{rScore.score} / 100</td>
                    <td className="py-2.5 text-center">
                      <span className={`px-2 py-0.5 border rounded-full text-[10px] uppercase font-bold ${badgeColor}`}>
                        {rScore.category}
                      </span>
                    </td>
                    <td className="py-2.5 pl-4 text-slate-400">
                      {rScore.factors.length === 0 ? (
                        <span className="text-slate-500">Low baseline risk</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {rScore.factors.map((f, i) => (
                            <span key={i} className="bg-slate-900 px-1.5 py-0.5 rounded text-[10px] text-slate-300 border border-slate-800">
                              {f.name} (+{f.score})
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
