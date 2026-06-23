// Handover and Completion Documents Dashboard Component (Page 11)
import React from 'react';

interface HandoverDashboardProps {
  handoverList: any[];
  onToggleItem: (id: string, approvedBy: string) => void;
  userRole: string;
}

export default function HandoverDashboard({
  handoverList,
  onToggleItem,
  userRole
}: HandoverDashboardProps) {
  const canApprove = ['super_admin', 'project_manager', 'employer_viewer'].includes(userRole);

  const handleToggle = (id: string) => {
    if (!canApprove) {
      alert('Unauthorized. Only Project Managers or Employer Representatives can sign off completion files.');
      return;
    }
    const name = userRole === 'employer_viewer' ? 'Employer Rep' : 'Project Manager';
    onToggleItem(id, name);
  };

  const total = handoverList.length;
  const approved = handoverList.filter(h => h.status === 'approved').length;
  const progressPercent = total > 0 ? Math.round((approved / total) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Overview Progress bar */}
      <div className="bg-slate-800/50 border border-slate-700/40 p-5 rounded-xl shadow-lg space-y-3">
        <div className="flex justify-between items-baseline">
          <h3 className="text-slate-200 text-sm font-semibold">Contract Completion Handover Checklist</h3>
          <span className="text-sm font-extrabold text-blue-400">{approved} / {total} Completed ({progressPercent}%)</span>
        </div>
        <div className="w-full bg-slate-700 h-2 rounded-full overflow-hidden">
          <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${progressPercent}%` }}></div>
        </div>
        <p className="text-[10px] text-slate-500">
          The contract requires submittal of As-Built surveys, operation manuals, and warranties prior to the issuance of the Taking-Over Certificate (TOC).
        </p>
      </div>

      {/* Main checklist table */}
      <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-5 shadow-lg">
        <h4 className="text-slate-300 text-xs font-bold uppercase tracking-wider mb-4">Required Handover Deliverables</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400 font-semibold">
                <th className="pb-3 w-10">Sign</th>
                <th className="pb-3">Deliverable Item Name</th>
                <th className="pb-3">Category classification</th>
                <th className="pb-3 text-center">Status</th>
                <th className="pb-3 text-right">Approved Sign-off</th>
                <th className="pb-3 text-right pr-2">Approval Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {handoverList.map(item => {
                const isApproved = item.status === 'approved';
                return (
                  <tr key={item.id} className="hover:bg-slate-800/10">
                    <td className="py-3 text-center">
                      <input
                        type="checkbox"
                        checked={isApproved}
                        onChange={() => handleToggle(item.id)}
                        className="rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                      />
                    </td>
                    <td className={`py-3 font-semibold ${isApproved ? 'text-slate-500 line-through' : 'text-slate-100'}`}>
                      {item.item_name}
                    </td>
                    <td className="py-3 capitalize text-slate-400">{item.category.replace('_', ' ')}</td>
                    <td className="py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        isApproved ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-700/30 text-slate-400'
                      }`}>
                        {item.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 text-right text-slate-300 font-mono">{item.approved_by || '-'}</td>
                    <td className="py-3 text-right text-slate-500 font-mono pr-2">{item.approved_date || '-'}</td>
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
