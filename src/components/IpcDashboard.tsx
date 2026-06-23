// IPC Valuation and Billing Dashboard Component (Page 7)
import React, { useState } from 'react';

interface IpcDashboardProps {
  ipcSubmissions: any[];
  onSubmitIPC: (ipc: { ipc_number: number; claimed_amount: number; submitted_date: string }) => void;
  onCertifyIPC: (id: string, certified_amount: number, retention: number, advance: number) => void;
  onPayIPC: (id: string, paid_amount: number) => void;
  userRole: string;
}

export default function IpcDashboard({
  ipcSubmissions,
  onSubmitIPC,
  onCertifyIPC,
  onPayIPC,
  userRole
}: IpcDashboardProps) {
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [ipcNumber, setIpcNumber] = useState(ipcSubmissions.length + 1);
  const [claimedAmount, setClaimedAmount] = useState(0);

  // Certification state
  const [selectedIpcId, setSelectedIpcId] = useState<string | null>(null);
  const [certAmount, setCertAmount] = useState(0);
  const [retentionAmount, setRetentionAmount] = useState(0);
  const [advanceAmount, setAdvanceAmount] = useState(0);

  // Payment state
  const [payIpcId, setPayIpcId] = useState<string | null>(null);
  const [paidAmount, setPaidAmount] = useState(0);

  const canSubmit = ['super_admin', 'project_manager', 'qs_billing_engineer'].includes(userRole);
  const canCertify = ['super_admin', 'project_director', 'employer_viewer'].includes(userRole);
  const canPay = ['super_admin', 'accountant'].includes(userRole);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (claimedAmount <= 0) {
      alert('Claimed amount must be greater than zero.');
      return;
    }
    onSubmitIPC({
      ipc_number: ipcNumber,
      claimed_amount: claimedAmount,
      submitted_date: new Date().toISOString().split('T')[0]
    });
    setClaimedAmount(0);
    setIpcNumber(prev => prev + 1);
    setShowSubmitModal(false);
    alert('IPC claim submitted successfully.');
  };

  const handleCertify = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIpcId) {
      onCertifyIPC(selectedIpcId, certAmount, retentionAmount, advanceAmount);
      setSelectedIpcId(null);
      alert('IPC certified successfully.');
    }
  };

  const handlePay = (e: React.FormEvent) => {
    e.preventDefault();
    if (payIpcId) {
      onPayIPC(payIpcId, paidAmount);
      setPayIpcId(null);
      alert('IPC payment recorded.');
    }
  };

  const startCertify = (ipc: any) => {
    setSelectedIpcId(ipc.id);
    setCertAmount(ipc.claimed_amount * 0.9); // Default suggestion
    setRetentionAmount(ipc.claimed_amount * 0.9 * 0.1); // Default 10%
    setAdvanceAmount(0);
  };

  const startPay = (ipc: any) => {
    setPayIpcId(ipc.id);
    setPaidAmount(ipc.certified_amount);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex justify-between items-center bg-slate-800/40 p-4 border border-slate-700/30 rounded-xl shadow">
        <div>
          <h2 className="text-slate-200 text-base font-semibold">Interim Payment Certificates (IPC) Valuation</h2>
          <p className="text-xs text-slate-400">Manage billing cycles, verify certifications, and track project cash flow.</p>
        </div>
        {canSubmit && (
          <button 
            onClick={() => setShowSubmitModal(!showSubmitModal)}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow transition"
          >
            📊 Submit New IPC Claim
          </button>
        )}
      </div>

      {/* Submit Claim Form */}
      {showSubmitModal && (
        <form onSubmit={handleSubmit} className="bg-slate-800/80 border border-slate-700 p-4 rounded-xl space-y-4 max-w-md shadow-lg">
          <h3 className="text-slate-200 text-xs font-bold uppercase tracking-wider">Submit IPC Claim</h3>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">IPC Number</label>
              <input
                type="number"
                value={ipcNumber}
                onChange={(e) => setIpcNumber(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-slate-200"
                required
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Claimed Amount (NPR)</label>
              <input
                type="number"
                value={claimedAmount}
                onChange={(e) => setClaimedAmount(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-slate-200"
                required
              />
            </div>
          </div>
          <button type="submit" className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded shadow transition">
            Submit Claim
          </button>
        </form>
      )}

      {/* Certify Form Modal */}
      {selectedIpcId && (
        <form onSubmit={handleCertify} className="bg-slate-800/80 border border-slate-700 p-4 rounded-xl space-y-4 max-w-md shadow-lg">
          <h3 className="text-slate-200 text-xs font-bold uppercase tracking-wider">Certify IPC Valuation</h3>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="col-span-3">
              <label className="block text-slate-400 mb-1">Gross Certified Amount (NPR)</label>
              <input
                type="number"
                value={certAmount}
                onChange={(e) => setCertAmount(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-slate-200"
                required
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Retention (10%)</label>
              <input
                type="number"
                value={retentionAmount}
                onChange={(e) => setRetentionAmount(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-slate-200"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Mobilization Rec</label>
              <input
                type="number"
                value={advanceAmount}
                onChange={(e) => setAdvanceAmount(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-slate-200"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Net Payable</label>
              <div className="bg-slate-900 border border-slate-800 p-2 rounded text-slate-400 font-semibold font-mono">
                {(certAmount - retentionAmount - advanceAmount).toLocaleString()}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded shadow transition">
              Verify Certification
            </button>
            <button type="button" onClick={() => setSelectedIpcId(null)} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold rounded">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Pay Form Modal */}
      {payIpcId && (
        <form onSubmit={handlePay} className="bg-slate-800/80 border border-slate-700 p-4 rounded-xl space-y-4 max-w-md shadow-lg">
          <h3 className="text-slate-200 text-xs font-bold uppercase tracking-wider">Record IPC Bank Release</h3>
          <div className="text-xs">
            <label className="block text-slate-400 mb-1">Cash Paid Amount (NPR)</label>
            <input
              type="number"
              value={paidAmount}
              onChange={(e) => setPaidAmount(Number(e.target.value))}
              className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-slate-200"
              required
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded shadow transition">
              Confirm Bank Settlement
            </button>
            <button type="button" onClick={() => setPayIpcId(null)} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold rounded">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* IPC History Register */}
      <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-5 shadow-lg">
        <h3 className="text-slate-200 text-sm font-semibold mb-4">Interim Payment Certificates Registry</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400 font-semibold">
                <th className="pb-3">IPC Number</th>
                <th className="pb-3 text-right">Claimed (NPR)</th>
                <th className="pb-3 text-right">Gross Certified (NPR)</th>
                <th className="pb-3 text-right">Retention Deduct (NPR)</th>
                <th className="pb-3 text-right">Advance Recovery (NPR)</th>
                <th className="pb-3 text-right">Net Paid (NPR)</th>
                <th className="pb-3 text-center">Status</th>
                <th className="pb-3 text-right pr-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {ipcSubmissions.map(ipc => {
                const netPayable = ipc.certified_amount - ipc.retention_deducted - ipc.advance_recovered;
                return (
                  <tr key={ipc.id} className="hover:bg-slate-800/10">
                    <td className="py-3 font-bold text-slate-100">IPC #{ipc.ipc_number}</td>
                    <td className="py-3 text-right font-mono">{(ipc.claimed_amount).toLocaleString()}</td>
                    <td className="py-3 text-right font-mono">{(ipc.certified_amount).toLocaleString()}</td>
                    <td className="py-3 text-right font-mono">{(ipc.retention_deducted).toLocaleString()}</td>
                    <td className="py-3 text-right font-mono">{(ipc.advance_recovered).toLocaleString()}</td>
                    <td className="py-3 text-right font-mono font-semibold text-slate-100">{(ipc.paid_amount || netPayable).toLocaleString()}</td>
                    <td className="py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        ipc.status === 'paid' ? 'bg-emerald-500/10 text-emerald-400' :
                        ipc.status === 'certified' ? 'bg-amber-500/10 text-amber-400 animate-pulse' :
                        'bg-red-500/10 text-red-400'
                      }`}>
                        {ipc.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 text-right pr-2">
                      <div className="flex justify-end gap-2 text-[11px] font-semibold">
                        {ipc.status === 'pending' && canCertify && (
                          <button onClick={() => startCertify(ipc)} className="text-purple-400 hover:text-purple-300">Certify</button>
                        )}
                        {ipc.status === 'certified' && canPay && (
                          <button onClick={() => startPay(ipc)} className="text-emerald-400 hover:text-emerald-300">Clear Pay</button>
                        )}
                        {ipc.status === 'paid' && (
                          <span className="text-slate-500 font-normal">Setted</span>
                        )}
                      </div>
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
