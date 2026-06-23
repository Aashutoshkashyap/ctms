// Defects Liability and Maintenance Tracker Dashboard Component (Page 12)
import React, { useState } from 'react';

interface DefectsDashboardProps {
  defectsList: any[];
  onAddDefect: (defect: any) => void;
  onUpdateStatus: (id: string, status: 'pending' | 'rectified' | 'verified') => void;
  userRole: string;
}

export default function DefectsDashboard({
  defectsList,
  onAddDefect,
  onUpdateStatus,
  userRole
}: DefectsDashboardProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [desc, setDesc] = useState('');
  const [team, setTeam] = useState('');
  const [deadline, setDeadline] = useState(new Date().toISOString().split('T')[0]);

  const canReport = ['super_admin', 'project_manager', 'qa_qc_engineer', 'employer_viewer'].includes(userRole);
  const canVerify = ['super_admin', 'project_manager', 'employer_viewer'].includes(userRole);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!desc || !team) return;
    onAddDefect({
      defect_description: desc,
      responsible_team: team,
      rectification_deadline: deadline
    });
    setDesc('');
    setTeam('');
    setShowAddForm(false);
    alert('Defect recorded in liability register.');
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex justify-between items-center bg-slate-800/40 p-4 border border-slate-700/30 rounded-xl shadow">
        <div>
          <h2 className="text-slate-200 text-base font-semibold">Defects Liability & Maintenance Tracker</h2>
          <p className="text-xs text-slate-400">Log punch list items and maintain quality rectification logs during the Defects Liability Period (DLP).</p>
        </div>
        {canReport && (
          <button 
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow transition"
          >
            🔧 Report Defect Item
          </button>
        )}
      </div>

      {/* Add form */}
      {showAddForm && (
        <form onSubmit={handleSubmit} className="bg-slate-800/80 border border-slate-700 p-4 rounded-xl space-y-4 max-w-md shadow-lg text-xs">
          <h3 className="text-slate-200 font-bold uppercase tracking-wider">Report Defect Issue</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-slate-400 mb-1">Defect Item Description</label>
              <textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="e.g. Scouring at drainage outlet, expansion joint seal tear"
                className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-slate-200"
                required
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Responsible Partner / Subcontractor Team</label>
              <input
                type="text"
                value={team}
                onChange={(e) => setTeam(e.target.value)}
                placeholder="e.g. Himalayan Builders / Subcontractor Steel"
                className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-slate-200"
                required
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Rectification Deadline</label>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-slate-200"
                required
              />
            </div>
          </div>
          <button type="submit" className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded shadow transition">
            Register Defect
          </button>
        </form>
      )}

      {/* Defects List Grid */}
      <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-5 shadow-lg">
        <h3 className="text-slate-200 text-sm font-semibold mb-4">Punch List & Defect Liability Registry</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400 font-semibold">
                <th className="pb-3">Defect Description Details</th>
                <th className="pb-3">Responsible Party</th>
                <th className="pb-3 text-right">Rectification Deadline</th>
                <th className="pb-3 text-center">Status</th>
                <th className="pb-3 text-right pr-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {defectsList.map(defect => (
                <tr key={defect.id} className="hover:bg-slate-800/10">
                  <td className="py-3 font-semibold text-slate-100">{defect.defect_description}</td>
                  <td className="py-3 text-slate-400 font-medium">{defect.responsible_team}</td>
                  <td className="py-3 text-right font-mono text-slate-400">{defect.rectification_deadline}</td>
                  <td className="py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      defect.status === 'verified' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                      defect.status === 'rectified' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                      'bg-red-500/10 text-red-400 border border-red-500/20 animate-pulse'
                    }`}>
                      {defect.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-3 text-right pr-2">
                    <div className="flex gap-2 justify-end text-[11px] font-semibold">
                      {defect.status === 'pending' && (
                        <button onClick={() => onUpdateStatus(defect.id, 'rectified')} className="text-blue-400 hover:text-blue-300">Rectified</button>
                      )}
                      {defect.status === 'rectified' && canVerify && (
                        <button onClick={() => onUpdateStatus(defect.id, 'verified')} className="text-emerald-400 hover:text-emerald-300">Verify</button>
                      )}
                      {defect.status === 'verified' && (
                        <span className="text-slate-500 font-normal">Closed</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
