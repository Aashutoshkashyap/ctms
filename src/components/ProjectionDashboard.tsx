// Projections and Schedule Recovery Dashboard (Page 4)
import React from 'react';
import { Activity } from '../lib/cpm';
import { EVMMetrics } from '../lib/evm';
import { calculateActivityRiskScore, RiskScoreDetails } from '../lib/evm';
import { formatBsDate } from '../lib/nepaliDate';

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
  let probability = 'High Probability';
  let probColor = 'text-emerald-700 border-emerald-200 bg-emerald-50';
  if (delayDays > 30) {
    probability = 'Critical Delay (Action Needed)';
    probColor = 'text-rose-700 border-rose-200 bg-rose-50 font-bold';
  } else if (delayDays > 0) {
    probability = 'Medium Risk of Delay';
    probColor = 'text-amber-700 border-amber-200 bg-amber-50 font-bold';
  }

  return (
    <div className="space-y-6">
      {/* Forecasting indicators */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Forecast Completion Details */}
        <div className="bg-white border border-slate-200/90 p-5 rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 text-sm">📅</span>
            <div>
              <h3 className="text-slate-900 text-xs font-bold uppercase tracking-wider">Completion Dates Analysis</h3>
              <p className="text-[11px] text-slate-500">Contractual target vs CPM forecast</p>
            </div>
          </div>
          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="text-slate-500">Contractual Completion:</span>
              <span className="font-semibold text-slate-900">{formatBsDate(project.target_completion_date)}</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="text-slate-500">Current Forecast:</span>
              <span className="font-semibold text-rose-600">{formatBsDate(calculatedFinish)}</span>
            </div>
            <div className="flex justify-between pb-1">
              <span className="text-slate-500">Delay Deviation:</span>
              <span className="font-bold text-rose-600">+{delayDays} Days</span>
            </div>
          </div>
          <div className={`border p-2.5 rounded-xl text-xs text-center font-bold mt-2 ${probColor}`}>
            On-Time Probability: {probability}
          </div>
        </div>

        {/* Required Recovery Rate */}
        <div className="bg-white border border-slate-200/90 p-5 rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50 text-sky-600 text-sm">⚡</span>
            <div>
              <h3 className="text-slate-900 text-xs font-bold uppercase tracking-wider">Required Recovery Rates</h3>
              <p className="text-[11px] text-slate-500">Necessary schedule catch-up burn rate</p>
            </div>
          </div>
          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="text-slate-500">Remaining Contract Time:</span>
              <span className="font-semibold text-slate-900">{remainingPlannedDays} Calendar Days</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="text-slate-500">Remaining Scope:</span>
              <span className="font-semibold text-slate-900">{remainingWorkPercent.toFixed(1)}% of total</span>
            </div>
            <div className="flex justify-between pb-1">
              <span className="text-slate-500">Required Weekly Rate:</span>
              <span className="font-bold text-blue-600">{requiredWeeklyProgress.toFixed(2)}% / week</span>
            </div>
          </div>
        </div>

        {/* Recovery Productivity Gap */}
        <div className="bg-white border border-slate-200/90 p-5 rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600 text-sm">📊</span>
            <div>
              <h3 className="text-slate-900 text-xs font-bold uppercase tracking-wider">Productivity Rate Gap</h3>
              <p className="text-[11px] text-slate-500">Current velocity vs needed capacity</p>
            </div>
          </div>
          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="text-slate-500">Current Weekly Progress:</span>
              <span className="font-semibold text-slate-900">{currentWeeklyProgress.toFixed(2)}% / week</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="text-slate-500">Recovery Gap Deficit:</span>
              <span className="font-bold text-rose-600">+{recoveryGap.toFixed(2)}% / week</span>
            </div>
            <div className="flex justify-between pb-1">
              <span className="text-slate-500">Required Crew Surge:</span>
              <span className="font-bold text-amber-600">+{Math.max(0, Math.round(recoveryRequiredMultiplier * 100))}% Capacity</span>
            </div>
          </div>
        </div>
      </div>

      {/* Activity Risk Table */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600 text-sm">🎯</span>
            <div>
              <h3 className="text-slate-900 text-sm font-bold">CPM Delay Risk Scores (Activity Level)</h3>
              <p className="text-[11px] text-slate-500">Automated risk assessment based on float, design package dependencies, and site constraints</p>
            </div>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {activities.length} Activities
          </span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">WBS</th>
                <th className="py-3 px-4">Activity Name</th>
                <th className="py-3 px-4 text-right">Remaining Dur</th>
                <th className="py-3 px-4 text-right">Risk Score</th>
                <th className="py-3 px-4 text-center">Risk Category</th>
                <th className="py-3 px-4">Key Risk Drivers</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {activities.map(act => {
                const rScore = calculateActivityRiskScore(act, designPackages, risks);
                
                let badgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                if (rScore.category === 'critical') badgeColor = 'bg-rose-50 text-rose-700 border-rose-200 font-bold';
                else if (rScore.category === 'high') badgeColor = 'bg-orange-50 text-orange-700 border-orange-200 font-bold';
                else if (rScore.category === 'medium') badgeColor = 'bg-amber-50 text-amber-700 border-amber-200';

                return (
                  <tr key={act.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono text-slate-500 font-semibold">{act.wbs_code}</td>
                    <td className="py-3 px-4 font-semibold text-slate-900">{act.name}</td>
                    <td className="py-3 px-4 text-right font-mono text-slate-600">{act.status === 'completed' ? '0d' : `${act.remaining_duration || act.planned_duration}d`}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">{rScore.score} / 100</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-block px-2.5 py-0.5 border rounded-full text-[10px] uppercase font-bold ${badgeColor}`}>
                        {rScore.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-500">
                      {rScore.factors.length === 0 ? (
                        <span className="text-slate-400 italic">Low baseline risk</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {rScore.factors.map((f, i) => (
                            <span key={i} className="bg-slate-100 px-2 py-0.5 rounded text-[10px] text-slate-700 border border-slate-200 font-medium">
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
