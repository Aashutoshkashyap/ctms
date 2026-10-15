// Design Management Dashboard Component (Page 5)
import React, { useState } from 'react';
import { formatBsDate } from '../lib/nepaliDate';

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

  const canEdit = ['project_director', 'project_manager', 'design_coordinator'].includes(userRole);

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
        <div className="lg:col-span-2 bg-white border border-slate-200/90 p-6 rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 text-sm">📐</span>
              <div>
                <h3 className="text-slate-900 text-sm font-bold">Design Packages & IFC Submissions</h3>
                <p className="text-xs text-slate-500">Track shop drawings, structural designs, employer reviews, and IFC approvals.</p>
              </div>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {designPackages.length} Packages
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-3">Package Name</th>
                  <th className="py-3 px-3">Category</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-3 text-right">Delay Impact</th>
                  <th className="py-3 px-3 pr-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {designPackages.map(pkg => (
                  <tr 
                    key={pkg.id} 
                    onClick={() => handleSelectPkg(pkg.id)}
                    className={`hover:bg-slate-50/80 cursor-pointer transition ${selectedPkgId === pkg.id ? 'bg-blue-50/60 font-medium' : ''}`}
                  >
                    <td className="py-3 px-3 font-semibold text-slate-900">{pkg.name}</td>
                    <td className="py-3 px-3 capitalize text-slate-500">{pkg.category.replace('_', ' ')}</td>
                    <td className="py-3 px-3 text-center">
                      <span className={`status-pill ${
                        pkg.status === 'approved' ? 'status-pill-completed' :
                        pkg.status === 'under_review' ? 'status-pill-pending' :
                        pkg.status === 'approved_with_comments' ? 'status-pill-progress' :
                        'status-pill-neutral'
                      }`}>
                        <span className="status-pill-dot" />
                        {pkg.status.replace(/_/g, ' ').toUpperCase()}
                      </span>
                    </td>
                    <td className={`py-3 px-3 text-right font-mono font-bold ${pkg.delay_days > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {pkg.delay_days > 0 ? `+${pkg.delay_days}d` : 'On Time'}
                    </td>
                    <td className="py-3 px-3 text-right text-blue-600 hover:text-blue-800 font-semibold pr-4">Review →</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected Package Details & Comments */}
        <div className="bg-white border border-slate-200/90 p-6 rounded-2xl shadow-xs flex flex-col min-h-[420px]">
          {selectedPkg ? (
            <div className="flex-1 flex flex-col space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-slate-900 text-sm font-bold">{selectedPkg.name}</h3>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                    {selectedPkg.category.replace('_', ' ')}
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-1">Review cycle, comments, and consultant remarks.</div>
              </div>

              {/* Status Update Form */}
              {canEdit && (
                <form onSubmit={handleStatusChange} className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex items-center justify-between gap-3">
                  <div className="flex-1">
                    <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Set Review Status</label>
                    <select
                      value={newStatus}
                      onChange={(e) => setNewStatus(e.target.value)}
                      className="bg-white text-xs border border-slate-300 text-slate-900 rounded-lg p-1.5 w-full outline-none focus:border-blue-600"
                    >
                      <option value="pending">Pending</option>
                      <option value="submitted">Submitted</option>
                      <option value="under_review">Under Review</option>
                      <option value="approved_with_comments">Approved with Comments</option>
                      <option value="approved">Approved / Issued for Construction (IFC)</option>
                    </select>
                  </div>
                  <button type="submit" className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-xs self-end transition">
                    Update
                  </button>
                </form>
              )}

              {/* Comments list */}
              <div className="flex-1 flex flex-col min-h-[160px]">
                <h4 className="text-slate-800 text-xs font-bold mb-2">Review Comments Audit Trail</h4>
                <div className="flex-1 overflow-y-auto max-h-[220px] border border-slate-200 bg-slate-50/50 p-3 rounded-xl space-y-2.5">
                  {comments.length === 0 ? (
                    <div className="text-center text-slate-400 py-8 text-xs">No design queries or comments yet.</div>
                  ) : (
                    comments.map(c => (
                      <div key={c.id} className="border-b border-slate-200/80 pb-2 last:border-b-0 space-y-1">
                        <div className="flex justify-between text-[10px]">
                          <span className="font-semibold text-blue-700 capitalize">{c.commenter_name} ({c.commenter_role.replace(/_/g, ' ')})</span>
                          <span className="text-slate-400">{formatBsDate(String(c.created_at).slice(0, 10))}</span>
                        </div>
                        <p className="text-xs text-slate-700">{c.comment_text}</p>
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
                    className="flex-1 bg-white border border-slate-300 text-xs text-slate-900 rounded-xl p-2 outline-none focus:border-blue-600"
                  />
                  <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition">
                    Send
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-400 text-xs p-6 space-y-2">
              <span className="text-3xl">👈</span>
              <p className="font-medium text-slate-600">Select a design package</p>
              <p className="text-[11px] text-slate-400">View detailed history, update IFC status, and read query comments.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
