// QA/QC Inspections Dashboard Component (Page 9)
import React, { useState } from 'react';

interface QaqcDashboardProps {
  qaqc: any[];
  onAddQAQC: (item: any) => void;
  onUpdateQAQC: (item: any) => void;
  userRole: string;
}

export default function QaqcDashboard({
  qaqc,
  onAddQAQC,
  onUpdateQAQC,
  userRole
}: QaqcDashboardProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [qaItem, setQaItem] = useState('');
  const [testType, setTestType] = useState('');
  const [inspectDate, setInspectDate] = useState(new Date().toISOString().split('T')[0]);

  const canEdit = ['super_admin', 'project_manager', 'qa_qc_engineer'].includes(userRole);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!qaItem) return;
    onAddQAQC({
      qa_item: qaItem,
      test_type: testType,
      inspection_date: inspectDate,
      status: 'pending',
      ncr_number: null,
      ncr_open_days: 0,
      test_result_details: ''
    });
    setQaItem('');
    setTestType('');
    setShowAddForm(false);
    alert('Inspection request registered successfully.');
  };

  const handleUpdateStatus = (item: any, status: 'passed' | 'failed') => {
    const isFailed = status === 'failed';
    const ncrNum = isFailed ? `NCR-0${Math.floor(Math.random() * 900) + 100}` : null;
    onUpdateQAQC({
      ...item,
      status,
      ncr_number: ncrNum,
      ncr_open_days: isFailed ? 1 : 0,
      test_result_details: isFailed ? 'Cube compressive strength below standard specs. NCR registered.' : 'Passed required specification bounds.'
    });
    alert(`Inspection marked as ${status}.`);
  };

  const total = qaqc.length;
  const passed = qaqc.filter(q => q.status === 'passed').length;
  const failed = qaqc.filter(q => q.status === 'failed').length;
  const pending = qaqc.filter(q => q.status === 'pending').length;

  return (
    <div className="space-y-6">
      {/* QA Grid summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-800/50 border border-slate-700/40 p-4 rounded-xl text-center shadow">
          <div className="text-slate-400 text-xs font-semibold">Total Quality Items</div>
          <div className="text-2xl font-bold mt-1 text-slate-100">{total}</div>
        </div>
        <div className="bg-slate-800/50 border border-emerald-700/20 p-4 rounded-xl text-center shadow">
          <div className="text-slate-400 text-xs font-semibold">Passed Inspections</div>
          <div className="text-2xl font-bold mt-1 text-emerald-400">{passed}</div>
        </div>
        <div className="bg-slate-800/50 border border-red-700/20 p-4 rounded-xl text-center shadow">
          <div className="text-slate-400 text-xs font-semibold">Failed / Open NCRs</div>
          <div className="text-2xl font-bold mt-1 text-rose-400">{failed}</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/40 p-4 rounded-xl text-center shadow">
          <div className="text-slate-400 text-xs font-semibold">Pending Request Inspections</div>
          <div className="text-2xl font-bold mt-1 text-slate-400">{pending}</div>
        </div>
      </div>

      {/* Action Header */}
      <div className="flex justify-between items-center bg-slate-800/40 p-4 border border-slate-700/30 rounded-xl shadow">
        <div>
          <h2 className="text-slate-200 text-base font-semibold">Request for Inspection (RFI) Register</h2>
          <p className="text-xs text-slate-400">Add requests, inspect concrete slump, concrete cubes, soil density, and monitor NCR status.</p>
        </div>
        {canEdit && (
          <button 
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow transition"
          >
            📐 Raise Inspection Request
          </button>
        )}
      </div>

      {/* Add request form */}
      {showAddForm && (
        <form onSubmit={handleSubmit} className="bg-slate-800/80 border border-slate-700 p-4 rounded-xl space-y-4 max-w-md shadow-lg text-xs">
          <h3 className="text-slate-200 font-bold uppercase tracking-wider">Raise Quality Inspection</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-slate-400 mb-1">Inspection Item / Chainage Location</label>
              <input
                type="text"
                placeholder="e.g. Slump test PCC bedding Pier 3 cap"
                value={qaItem}
                onChange={(e) => setQaItem(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-slate-200"
                required
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Test standard type</label>
              <input
                type="text"
                placeholder="e.g. Concrete cubes compressive strength M25"
                value={testType}
                onChange={(e) => setTestType(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-slate-200"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Scheduled Date</label>
              <input
                type="date"
                value={inspectDate}
                onChange={(e) => setInspectDate(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-slate-200"
                required
              />
            </div>
          </div>
          <button type="submit" className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded shadow transition">
            Save Inspection Request
          </button>
        </form>
      )}

      {/* Register List */}
      <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-5 shadow-lg">
        <h3 className="text-slate-200 text-sm font-semibold mb-4">Quality & Material Test Registry</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400 font-semibold">
                <th className="pb-3">Inspection Item Details</th>
                <th className="pb-3">Test standard</th>
                <th className="pb-3 text-right">Inspection Date</th>
                <th className="pb-3 text-center">Status</th>
                <th className="pb-3 text-right">NCR Code</th>
                <th className="pb-3 pl-4">Audit Result Notes</th>
                {canEdit && <th className="pb-3 text-right pr-2">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {qaqc.map(item => (
                <tr key={item.id} className="hover:bg-slate-800/10">
                  <td className="py-3 font-semibold text-slate-100">{item.qa_item}</td>
                  <td className="py-3 text-slate-400">{item.test_type || 'Standard inspection'}</td>
                  <td className="py-3 text-right font-mono">{item.inspection_date}</td>
                  <td className="py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      item.status === 'passed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                      item.status === 'failed' ? 'bg-red-500/10 text-red-400 border border-red-500/20 animate-pulse' :
                      'bg-slate-700/30 text-slate-400'
                    }`}>
                      {item.status.toUpperCase()}
                    </span>
                  </td>
                  <td className={`py-3 text-right font-mono font-bold ${item.ncr_number ? 'text-red-400' : 'text-slate-500'}`}>
                    {item.ncr_number || '-'}
                  </td>
                  <td className="py-3 pl-4 text-slate-400">{item.test_result_details || 'Awaiting site audit'}</td>
                  {canEdit && (
                    <td className="py-3 text-right pr-2">
                      {item.status === 'pending' ? (
                        <div className="flex gap-2 justify-end text-[11px] font-semibold">
                          <button onClick={() => handleUpdateStatus(item, 'passed')} className="text-emerald-400 hover:text-emerald-300">Pass</button>
                          <button onClick={() => handleUpdateStatus(item, 'failed')} className="text-red-400 hover:text-red-300">Fail</button>
                        </div>
                      ) : (
                        <span className="text-slate-500 font-normal">Audited</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
