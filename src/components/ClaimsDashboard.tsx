// Claims & Variation Register Dashboard Component (Page 8)
import React, { useState } from 'react';
import { draftClaimLetter } from '../lib/ai';

interface ClaimsDashboardProps {
  claims: any[];
  onAddClaim: (claim: any) => void;
  onUpdateClaimStatus: (id: string, status: string) => void;
  userRole: string;
}

export default function ClaimsDashboard({
  claims,
  onAddClaim,
  onUpdateClaimStatus,
  userRole
}: ClaimsDashboardProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [title, setTitle] = useState('');
  const [refId, setRefId] = useState('');
  const [type, setType] = useState<'variation' | 'claim_eot' | 'claim_cost'>('claim_eot');
  const [timeImpact, setTimeImpact] = useState(0);
  const [costImpact, setCostImpact] = useState(0);

  // AI draft states
  const [draftedLetter, setDraftedLetter] = useState<string | null>(null);
  const [draftingId, setDraftingId] = useState<string | null>(null);

  const canEdit = ['super_admin', 'project_manager', 'qs_billing_engineer'].includes(userRole);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !refId) return;
    
    onAddClaim({
      type,
      reference_id: refId,
      title,
      event_date: new Date().toISOString().split('T')[0],
      notice_date: new Date().toISOString().split('T')[0],
      time_impact_days: timeImpact,
      cost_impact_amount: costImpact,
      supporting_docs: ['Joint_Site_Survey_Minutes.pdf']
    });

    setTitle('');
    setRefId('');
    setTimeImpact(0);
    setCostImpact(0);
    setShowAddForm(false);
    alert('Claim/Variation event registered.');
  };

  const handleGenerateDraft = async (claim: any) => {
    setDraftingId(claim.id);
    try {
      const letter = await draftClaimLetter(
        claim.reference_id,
        claim.title,
        claim.type === 'claim_eot' ? 'FIDIC Yellow Book Clause 8.4' : 'GCC Clause 44',
        claim.time_impact_days,
        claim.cost_impact_amount
      );
      setDraftedLetter(letter);
    } catch (e) {
      alert('Draft generation failed.');
    } finally {
      setDraftingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex justify-between items-center bg-slate-800/40 p-4 border border-slate-700/30 rounded-xl shadow">
        <div>
          <h2 className="text-slate-200 text-base font-semibold">Variations & Contractual Claims Register</h2>
          <p className="text-xs text-slate-400">Track Variation Orders (VO), Extension of Time (EOT) requests, and formal notices of claim.</p>
        </div>
        {canEdit && (
          <button 
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow transition"
          >
            📋 Register Claim / Variation
          </button>
        )}
      </div>

      {/* Add form */}
      {showAddForm && (
        <form onSubmit={handleSubmit} className="bg-slate-800/80 border border-slate-700 p-4 rounded-xl space-y-4 max-w-xl shadow-lg text-xs">
          <h3 className="text-slate-200 font-bold uppercase tracking-wider">Register Variation / Claim</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 mb-1">Reference ID (e.g. CLM-EOT-02)</label>
              <input
                type="text"
                value={refId}
                onChange={(e) => setRefId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-slate-200"
                required
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Category type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as any)}
                className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-slate-200"
              >
                <option value="claim_eot">Extension of Time (EOT) Claim</option>
                <option value="variation">Variation Order (VO) Change</option>
                <option value="claim_cost">Cost/Financial Claim</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-slate-400 mb-1">Event title description</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-slate-200"
                placeholder="Describe the claim trigger..."
                required
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Estimated Time Impact (Days)</label>
              <input
                type="number"
                value={timeImpact}
                onChange={(e) => setTimeImpact(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-slate-200"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Estimated Cost Impact (NPR)</label>
              <input
                type="number"
                value={costImpact}
                onChange={(e) => setCostImpact(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-slate-200"
              />
            </div>
          </div>
          <button type="submit" className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded shadow transition">
            Save Claim Record
          </button>
        </form>
      )}

      {/* Main Grid: Claims List & AI Letter Output */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Register Grid */}
        <div className="lg:col-span-2 bg-slate-800/50 border border-slate-700/40 p-5 rounded-xl shadow-lg space-y-4">
          <h3 className="text-slate-200 text-sm font-semibold">Registered Variations & Claims Pipeline</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400 font-semibold">
                  <th className="pb-3">Ref ID</th>
                  <th className="pb-3">Event Details</th>
                  <th className="pb-3">Type</th>
                  <th className="pb-3 text-right">Time Impact</th>
                  <th className="pb-3 text-right">Cost Impact (NPR)</th>
                  <th className="pb-3 text-center">Status</th>
                  {canEdit && <th className="pb-3 text-right pr-2">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {claims.map(claim => (
                  <tr key={claim.id} className="hover:bg-slate-800/10">
                    <td className="py-3 font-mono font-bold text-slate-400">{claim.reference_id}</td>
                    <td className="py-3">
                      <div className="font-semibold text-slate-100">{claim.title}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Notice date: {claim.notice_date}</div>
                    </td>
                    <td className="py-3">
                      <span className="capitalize text-[10px] bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded text-slate-400">
                        {claim.type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 text-right font-mono font-bold text-amber-400">+{claim.time_impact_days}d</td>
                    <td className="py-3 text-right font-mono">{(claim.cost_impact_amount).toLocaleString()}</td>
                    <td className="py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        claim.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400' :
                        claim.status === 'rejected' ? 'bg-rose-500/10 text-rose-400' :
                        'bg-amber-500/10 text-amber-400 animate-pulse'
                      }`}>
                        {claim.status.toUpperCase()}
                      </span>
                    </td>
                    {canEdit && (
                      <td className="py-3 text-right pr-2">
                        <button 
                          onClick={() => handleGenerateDraft(claim)}
                          disabled={draftingId === claim.id}
                          className="text-blue-400 hover:text-blue-300 font-semibold"
                        >
                          {draftingId === claim.id ? 'Drafting...' : '✍️ Draft Notice'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* AI Letter Output Preview */}
        <div className="bg-slate-800/50 border border-slate-700/40 p-5 rounded-xl shadow-lg flex flex-col min-h-[400px]">
          <h3 className="text-slate-200 text-sm font-semibold mb-3">AI Contract Claim Notice Draft</h3>
          {draftedLetter ? (
            <div className="flex-1 flex flex-col space-y-3">
              <div className="flex-1 overflow-y-auto max-h-[300px] border border-slate-850 bg-slate-950 p-3 rounded-lg text-slate-300 font-mono text-[10px] whitespace-pre-wrap leading-relaxed">
                {draftedLetter}
              </div>
              <div className="flex gap-2 justify-end">
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(draftedLetter);
                    alert('Claim notice copied to clipboard!');
                  }}
                  className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded shadow transition"
                >
                  📋 Copy Notice
                </button>
                <button 
                  onClick={() => setDraftedLetter(null)}
                  className="px-2.5 py-1.5 bg-slate-750 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded"
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-700 rounded-lg text-slate-500 text-xs">
              <span>No notice draft generated yet.</span>
              <span className="text-[10px] text-slate-600 mt-1">Select "Draft Notice" on a claim in the left register to auto-generate a FIDIC compliant delay notification letter.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
