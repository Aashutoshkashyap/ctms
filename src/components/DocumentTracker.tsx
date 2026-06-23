// Document Status Registry and Tracker Component
import React, { useState, useMemo, useEffect } from 'react';
import { storage, DocumentItem as DocItem } from '../lib/storage';

interface DocumentTrackerProps {
  userRole: string;
  projectId: string;
}

const DEFAULT_DOCUMENTS: DocItem[] = [
    {
      id: 'doc-1',
      ref_number: 'BT-KFT-CTR-001',
      title: 'FIDIC Conditions of Contract - Joint Venture Agreement',
      category: 'contract',
      version: 'Rev 0',
      submitted_date: '2025-01-05',
      action_date: '2025-01-10',
      status: 'approved',
      owner: 'Arjun Adhikari (Super Admin)',
      remarks: 'Signed by lead and partner representatives.'
    },
    {
      id: 'doc-2',
      ref_number: 'BT-KFT-SEC-012',
      title: 'Performance Bank Guarantee - NPR 25,000,000',
      category: 'security',
      version: 'Rev 1',
      submitted_date: '2025-01-12',
      action_date: '2025-01-18',
      status: 'approved',
      owner: 'Eng. Santosh Yadav (PM)',
      remarks: 'Certified by Nepal Investment Mega Bank.'
    },
    {
      id: 'doc-3',
      ref_number: 'BT-KFT-VAR-003',
      title: 'Variation Order Claim for Bridge Foundation Soil Soil-Shift',
      category: 'variation',
      version: 'Rev 2',
      submitted_date: '2025-06-10',
      action_date: null,
      status: 'under_review',
      owner: 'Sujita Shrestha (Planning Eng)',
      remarks: 'Awaiting Consultant geo-tech validation.'
    },
    {
      id: 'doc-4',
      ref_number: 'BT-KFT-TST-401',
      title: 'Concrete Cylinder Crushing Test Report - Pier 1 Cap',
      category: 'test_record',
      version: 'Rev 0',
      submitted_date: '2025-06-20',
      action_date: '2025-06-22',
      status: 'approved',
      owner: 'Kiran KC (QA/QC Eng)',
      remarks: 'Achieved 28-day target of 35 MPa.'
    },
    {
      id: 'doc-5',
      ref_number: 'BT-KFT-PMT-089',
      title: 'Tree Felling Permit (Bagmati Forestry Sector Clearance)',
      category: 'permit',
      version: 'Rev 0',
      submitted_date: '2025-02-18',
      action_date: '2025-03-05',
      status: 'approved',
      owner: 'Prem Chaudhary (Safety Officer)',
      remarks: 'Clearance obtained for Chainage 12-14.'
    },
    {
      id: 'doc-6',
      ref_number: 'BT-KFT-SEC-015',
      title: 'Advance Payment Guarantee Security Bond',
      category: 'security',
      version: 'Rev 0',
      submitted_date: '2025-01-15',
      action_date: '2025-01-20',
      status: 'approved',
      owner: 'Gopal Bhatta (QS)',
      remarks: '10% of Contract Price released.'
    },
    {
      id: 'doc-7',
      ref_number: 'BT-KFT-VAR-004',
      title: 'EOT Notice - Extension of time request (Design comments delay)',
      category: 'variation',
      version: 'Rev 1',
      submitted_date: '2025-05-15',
      action_date: null,
      status: 'under_review',
      owner: 'Eng. Santosh Yadav (PM)',
      remarks: 'Submitted formally under Clause 8.4.'
    },
    {
      id: 'doc-8',
      ref_number: 'BT-KFT-RFI-044',
      title: 'RFI — Pier cap reinforcement congestion detail',
      category: 'rfi',
      version: 'Rev 0',
      submitted_date: '2025-06-21',
      action_date: null,
      status: 'under_review',
      owner: 'Site Engineering Team',
      remarks: 'Designer response required before fixing reinforcement.'
    },
    {
      id: 'doc-9',
      ref_number: 'BT-KFT-NOT-018',
      title: 'Contractual notice of delayed IFC drawing release',
      category: 'notice',
      version: 'Rev 0',
      submitted_date: '2025-06-18',
      action_date: null,
      status: 'under_review',
      owner: 'Planning Engineer',
      remarks: 'Notice issued under the contract notice provisions.'
    },
    {
      id: 'doc-10',
      ref_number: 'BT-KFT-APR-032',
      title: 'Approval — foundation method statement',
      category: 'approval',
      version: 'Rev 1',
      submitted_date: '2025-06-11',
      action_date: '2025-06-19',
      status: 'approved',
      owner: 'Design Coordinator',
      remarks: 'Approved with incorporated temporary works comments.'
    }
];

export default function DocumentTracker({ userRole, projectId }: DocumentTrackerProps) {
  const [documents, setDocuments] = useState<DocItem[]>(() =>
    storage.getDocuments(projectId === 'proj-101' ? DEFAULT_DOCUMENTS : [])
  );

  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Create doc state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<DocItem['category']>('test_record');
  const [newRef, setNewRef] = useState('');
  const [newRemarks, setNewRemarks] = useState('');

  // Rights management
  const canModify = [
    'super_admin', 'project_manager', 'planning_engineer', 'site_engineer',
    'design_coordinator', 'qs_billing_engineer', 'qa_qc_engineer', 'safety_officer'
  ].includes(userRole);
  const canApprove = ['super_admin', 'project_director', 'employer_viewer'].includes(userRole);

  useEffect(() => {
    storage.saveDocuments(documents);
  }, [documents, projectId]);

  const handleAddDocument = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle || !newRef) return;
    
    const ownerName = userRole.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
    const newDoc: DocItem = {
      id: `doc-${Date.now()}`,
      ref_number: newRef,
      title: newTitle,
      category: newCategory,
      version: 'Rev 0',
      submitted_date: new Date().toISOString().split('T')[0],
      action_date: null,
      status: 'draft',
      owner: ownerName,
      remarks: newRemarks
    };

    setDocuments(prev => [newDoc, ...prev]);
    setNewTitle('');
    setNewRef('');
    setNewRemarks('');
    setShowAddForm(false);
    alert('Document added to registry.');
  };

  const handleUpdateStatus = (id: string, nextStatus: 'approved' | 'rejected' | 'under_review') => {
    setDocuments(prev => prev.map(doc => {
      if (doc.id === id) {
        return {
          ...doc,
          status: nextStatus,
          action_date: new Date().toISOString().split('T')[0]
        };
      }
      return doc;
    }));
    alert(`Document status updated to ${nextStatus.toUpperCase()}`);
  };

  // Filtered list
  const filteredDocs = useMemo(() => {
    return documents.filter(doc => {
      const catMatch = filterCategory === 'all' || doc.category === filterCategory;
      const searchMatch = searchQuery === '' || 
        doc.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
        doc.ref_number.toLowerCase().includes(searchQuery.toLowerCase()) || 
        doc.owner.toLowerCase().includes(searchQuery.toLowerCase());
      return catMatch && searchMatch;
    });
  }, [documents, filterCategory, searchQuery]);

  // Statistics
  const stats = useMemo(() => {
    const total = documents.length;
    const approved = documents.filter(d => d.status === 'approved').length;
    const underReview = documents.filter(d => d.status === 'under_review').length;
    const draft = documents.filter(d => d.status === 'draft').length;
    return { total, approved, underReview, draft };
  }, [documents]);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex justify-between items-center bg-slate-800/40 p-4 border border-slate-700/30 rounded-xl shadow">
        <div>
          <h2 className="text-slate-200 text-base font-semibold">Document Status Registry</h2>
          <p className="text-xs text-slate-400">Track contracts, securities, RFIs, notices, approvals, permits, variations, and QA/QC records.</p>
        </div>
        {canModify && (
          <button 
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow transition"
          >
            📄 Register New Document
          </button>
        )}
      </div>

      {/* Stats Board */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-slate-800/40 border border-slate-700/30 p-4 rounded-xl shadow-lg">
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Total Documents</span>
          <p className="text-xl font-bold font-mono text-slate-200 mt-1">{stats.total}</p>
        </div>
        <div className="bg-slate-800/40 border border-slate-700/30 p-4 rounded-xl shadow-lg">
          <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider">Approved</span>
          <p className="text-xl font-bold font-mono text-emerald-400 mt-1">{stats.approved}</p>
        </div>
        <div className="bg-slate-800/40 border border-slate-700/30 p-4 rounded-xl shadow-lg">
          <span className="text-[10px] text-amber-500 font-bold uppercase tracking-wider">Under Review</span>
          <p className="text-xl font-bold font-mono text-amber-400 mt-1">{stats.underReview}</p>
        </div>
        <div className="bg-slate-800/40 border border-slate-700/30 p-4 rounded-xl shadow-lg">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Drafts</span>
          <p className="text-xl font-bold font-mono text-slate-400 mt-1">{stats.draft}</p>
        </div>
      </div>

      {/* Add Document Form */}
      {showAddForm && (
        <form onSubmit={handleAddDocument} className="bg-slate-800/80 border border-slate-700 p-4 rounded-xl space-y-4 max-w-md shadow-lg text-xs">
          <h3 className="text-slate-200 font-bold uppercase tracking-wider">Submit Document to Registry</h3>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">Ref Number</label>
                <input
                  type="text"
                  value={newRef}
                  onChange={(e) => setNewRef(e.target.value)}
                  placeholder="e.g. BT-KFT-TST-002"
                  className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-slate-200"
                  required
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Category</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-slate-200"
                >
                  <option value="contract">Contract/Agreement</option>
                  <option value="security">Security Guarantee</option>
                  <option value="variation">Variation / EOT</option>
                  <option value="rfi">Request for Information (RFI)</option>
                  <option value="notice">Contractual Notice</option>
                  <option value="approval">Approval / Consent</option>
                  <option value="test_record">QA/QC Test Record</option>
                  <option value="permit">Permit / Forestry Approval</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Document Title</label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Detailed Design Concrete Compaction Report"
                className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-slate-200"
                required
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Remarks / Details</label>
              <textarea
                value={newRemarks}
                onChange={(e) => setNewRemarks(e.target.value)}
                placeholder="Details of verification or specific submittal info"
                className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-slate-200"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded shadow transition">
              Record Document
            </button>
            <button type="button" onClick={() => setShowAddForm(false)} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Filters and Registry list */}
      <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-5 shadow-lg space-y-4">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3">
          {/* Category Filter buttons */}
          <div className="flex flex-wrap gap-2 text-xs">
            {['all', 'contract', 'security', 'rfi', 'notice', 'approval', 'variation', 'test_record', 'permit'].map((cat) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`px-2.5 py-1 rounded font-semibold transition ${
                  filterCategory === cat
                    ? 'bg-blue-600 text-white shadow'
                    : 'bg-slate-900/60 hover:bg-slate-900 text-slate-400 hover:text-slate-200'
                }`}
              >
                {cat === 'all' ? 'Show All' : cat.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </button>
            ))}
          </div>
          {/* Search bar */}
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search registry files..."
              className="bg-slate-900 border border-slate-700/80 text-slate-200 text-xs px-3 py-1.5 rounded-lg w-full md:w-56 focus:outline-none focus:border-slate-600"
            />
          </div>
        </div>

        {/* Registry Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400 font-semibold">
                <th className="pb-3 w-32">Doc Ref No.</th>
                <th className="pb-3">Title Description</th>
                <th className="pb-3">Category</th>
                <th className="pb-3 w-16 text-center">Version</th>
                <th className="pb-3 text-right">Submitted</th>
                <th className="pb-3 text-right">Action Date</th>
                <th className="pb-3 text-center">Status</th>
                <th className="pb-3 text-right pr-2">Register Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {filteredDocs.map(doc => (
                <tr key={doc.id} className="hover:bg-slate-800/10">
                  <td className="py-3 font-mono font-bold text-slate-400">{doc.ref_number}</td>
                  <td className="py-3">
                    <p className="font-semibold text-slate-100">{doc.title}</p>
                    <p className="text-[10px] text-slate-500">By: {doc.owner} | Remarks: {doc.remarks || 'None'}</p>
                  </td>
                  <td className="py-3 capitalize text-slate-400">{doc.category.replace('_', ' ')}</td>
                  <td className="py-3 text-center font-mono">{doc.version}</td>
                  <td className="py-3 text-right font-mono text-slate-400">{doc.submitted_date}</td>
                  <td className="py-3 text-right font-mono text-slate-400">{doc.action_date || '-'}</td>
                  <td className="py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      doc.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400' :
                      doc.status === 'rejected' ? 'bg-rose-500/10 text-rose-400' :
                      doc.status === 'under_review' ? 'bg-amber-500/10 text-amber-400 animate-pulse' :
                      'bg-slate-700/40 text-slate-400'
                    }`}>
                    {doc.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-3 text-right pr-2">
                    {doc.status === 'draft' && canModify && (
                      <button 
                        onClick={() => handleUpdateStatus(doc.id, 'under_review')}
                        className="text-xs text-blue-400 hover:text-blue-300 font-semibold"
                      >
                        Submit Review
                      </button>
                    )}
                    {doc.status === 'under_review' && canApprove && (
                      <div className="flex gap-2 justify-end text-[11px] font-semibold">
                        <button 
                          onClick={() => handleUpdateStatus(doc.id, 'approved')}
                          className="text-emerald-400 hover:text-emerald-300"
                        >
                          Approve
                        </button>
                        <button 
                          onClick={() => handleUpdateStatus(doc.id, 'rejected')}
                          className="text-rose-400 hover:text-rose-300"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                    {doc.status === 'approved' && (
                      <span className="text-slate-500 font-normal">Filed</span>
                    )}
                    {doc.status === 'rejected' && canModify && (
                      <button 
                        onClick={() => handleUpdateStatus(doc.id, 'under_review')}
                        className="text-xs text-amber-400 hover:text-amber-300 font-semibold"
                      >
                        Resubmit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filteredDocs.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-slate-500 font-medium">No documents found matching the filter selection.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
