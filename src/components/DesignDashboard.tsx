// Design Management Dashboard Component (Page 5)
import React, { useState } from 'react';

interface DesignDashboardProps {
  designPackages: any[];
  onAddComment: (comment: { design_package_id: string; commenter_role: string; commenter_name: string; comment_text: string }) => void;
  onUpdatePackage: (pkg: any) => void;
  getComments: (id: string) => any[];
  userRole: string;
}

export default function DesignDashboard({
  designPackages,
  onAddComment,
  onUpdatePackage,
  getComments,
  userRole
}: DesignDashboardProps) {
  const [selectedPkgId, setSelectedPkgId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [newStatus, setNewStatus] = useState<any>('');

  const selectedPkg = designPackages.find(p => p.id === selectedPkgId);
  const comments = selectedPkg ? getComments(selectedPkg.id) : [];

  const canEdit = ['super_admin', 'project_manager', 'design_coordinator'].includes(userRole);

  const handleSelectPkg = (id: string) => {
    setSelectedPkgId(id);
    const pkg = designPackages.find(p => p.id === id);
    if (pkg) setNewStatus(pkg.status);
  };

  const handleStatusChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedPkg) {
      onUpdatePackage({
        ...selectedPkg,
        status: newStatus,
        approved_date: newStatus === 'approved' ? new Date().toISOString().split('T')[0] : null
      });
      alert('Design package status updated.');
    }
  };

  const handlePostComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || !selectedPkgId) return;
    
    // Set commenter name based on active role
    let name = 'Design Coordinator';
    if (userRole === 'employer_viewer') name = 'Employer Representative';
    else if (userRole === 'project_manager') name = 'Project Manager';

    onAddComment({
      design_package_id: selectedPkgId,
      commenter_role: userRole,
      commenter_name: name,
      comment_text: commentText
    });
    setCommentText('');
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Design package list */}
        <div className="lg:col-span-2 bg-slate-800/50 border border-slate-700/40 p-5 rounded-xl shadow-lg space-y-4">
          <h3 className="text-slate-200 text-sm font-semibold">Design Packages & IFC Submissions Register</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400 font-semibold">
                  <th className="pb-3">Package Name</th>
                  <th className="pb-3">Category</th>
                  <th className="pb-3 text-center">Status</th>
                  <th className="pb-3 text-right">Delay Days</th>
                  <th className="pb-3 pr-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {designPackages.map(pkg => (
                  <tr 
                    key={pkg.id} 
                    onClick={() => handleSelectPkg(pkg.id)}
                    className={`hover:bg-slate-800/20 cursor-pointer transition ${selectedPkgId === pkg.id ? 'bg-slate-800/40 border-l-2 border-purple-500' : ''}`}
                  >
                    <td className="py-3 font-semibold text-slate-100">{pkg.name}</td>
                    <td className="py-3 capitalize text-slate-400">{pkg.category.replace('_', ' ')}</td>
                    <td className="py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        pkg.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400' :
                        pkg.status === 'under_review' ? 'bg-purple-500/10 text-purple-400' :
                        pkg.status === 'approved_with_comments' ? 'bg-amber-500/10 text-amber-400' :
                        'bg-slate-700/30 text-slate-400'
                      }`}>
                        {pkg.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className={`py-3 text-right font-mono font-bold ${pkg.delay_days > 0 ? 'text-red-400' : 'text-slate-500'}`}>
                      {pkg.delay_days > 0 ? `+${pkg.delay_days}d` : 'On Time'}
                    </td>
                    <td className="py-3 text-right text-blue-400 hover:text-blue-300 font-semibold pr-2">Review</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected Package Details & Comments */}
        <div className="bg-slate-800/50 border border-slate-700/40 p-5 rounded-xl shadow-lg flex flex-col min-h-[400px]">
          {selectedPkg ? (
            <div className="flex-1 flex flex-col space-y-4">
              <div>
                <h3 className="text-slate-200 text-sm font-semibold">{selectedPkg.name}</h3>
                <div className="text-[10px] text-slate-500 uppercase mt-0.5">Category: {selectedPkg.category.replace('_', ' ')}</div>
              </div>

              {/* Status Update Form */}
              {canEdit && (
                <form onSubmit={handleStatusChange} className="bg-slate-900/40 p-3 rounded-lg border border-slate-800 flex items-center justify-between gap-2">
                  <div className="flex-1">
                    <label className="block text-[9px] text-slate-500 uppercase mb-1">Set Review Status</label>
                    <select
                      value={newStatus}
                      onChange={(e) => setNewStatus(e.target.value)}
                      className="bg-slate-900 text-xs border border-slate-700 text-slate-200 rounded p-1 w-full"
                    >
                      <option value="pending">Pending</option>
                      <option value="submitted">Submitted</option>
                      <option value="under_review">Under Review</option>
                      <option value="approved_with_comments">Approved with Comments</option>
                      <option value="approved">Approved / IFC</option>
                    </select>
                  </div>
                  <button type="submit" className="px-2.5 py-1.5 bg-purple-700 hover:bg-purple-600 text-white text-[10px] font-bold rounded shadow self-end">
                    Update
                  </button>
                </form>
              )}

              {/* Comments list */}
              <div className="flex-1 flex flex-col min-h-[150px]">
                <h4 className="text-slate-300 text-xs font-semibold mb-2">Review Comments Audit Trail</h4>
                <div className="flex-1 overflow-y-auto max-h-[200px] border border-slate-850 bg-slate-950/20 p-2.5 rounded-lg space-y-2.5">
                  {comments.length === 0 ? (
                    <div className="text-center text-slate-500 py-8 text-[10px]">No design queries or comments yet.</div>
                  ) : (
                    comments.map(c => (
                      <div key={c.id} className="border-b border-slate-850 pb-2 last:border-b-0 space-y-1">
                        <div className="flex justify-between text-[9px]">
                          <span className="font-semibold text-purple-400 capitalize">{c.commenter_name} ({c.commenter_role.replace(/_/g, ' ')})</span>
                          <span className="text-slate-500">{new Date(c.created_at).toLocaleDateString()}</span>
                        </div>
                        <p className="text-[11px] text-slate-300">{c.comment_text}</p>
                      </div>
                    ))
                  )}
                </div>

                {/* Post comment form */}
                <form onSubmit={handlePostComment} className="mt-3 flex gap-2">
                  <input
                    type="text"
                    placeholder="Add comment / design query..."
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-700 text-xs text-slate-200 rounded p-1.5 focus:outline-none focus:border-purple-500"
                  />
                  <button type="submit" className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded">
                    Send
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-center text-slate-500 text-xs">
              Select a design package to view detailed history, change approval status, and read review comments.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
