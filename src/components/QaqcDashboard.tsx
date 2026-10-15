// QA/QC Inspections Dashboard Component (Page 9)
import React, { useState } from 'react';
import BsDatePicker from './BsDatePicker';
import { formatBsDate } from '../lib/nepaliDate';
import { storage } from '../lib/storage';
import UploadProgress from './UploadProgress';
import { useSubmissionLock } from '../lib/useSubmissionLock';

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
  const [sampleDate, setSampleDate] = useState('');
  const [testedDate, setTestedDate] = useState('');
  const [resultFiles, setResultFiles] = useState<Record<string, File | null>>({});
  const { busy: uploading, run: runUpload } = useSubmissionLock();

  const canEdit = ['project_director', 'project_manager', 'qa_qc_engineer'].includes(userRole);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!qaItem) return;
    onAddQAQC({
      qa_item: qaItem,
      test_type: testType,
      inspection_date: inspectDate,
      sample_collection_date: sampleDate,
      tested_date: testedDate,
      status: 'pending',
      ncr_number: null,
      ncr_open_days: 0,
      test_result_details: ''
    });
    setQaItem('');
    setTestType('');
    setSampleDate('');
    setTestedDate('');
    setShowAddForm(false);
    alert('Inspection request registered successfully.');
  };

  const handleUpdateStatus = async (item: any, status: 'passed' | 'failed') => {
    const reportFile = resultFiles[item.id];
    if (!item.report_storage_path && !item.report_url && !reportFile) {
      window.alert('Upload the test result or NCR report before recording the inspection result.');
      return;
    }
    await runUpload(async () => {
    const isFailed = status === 'failed';
    const highestNcr = qaqc.reduce((highest, record) => {
      const code = String(record.ncr_code || record.ncr_number || '');
      const numericPart = Number(code.match(/\d+/)?.[0] || 0);
      return Math.max(highest, numericPart);
    }, 0);
    const ncrNum = isFailed ? `NCR-${String(highestNcr + 1).padStart(3, '0')}` : null;
    let report_storage_path = item.report_storage_path || '';
    let report_url = item.report_url || '';
    if (reportFile) {
      try {
        const uploaded = await storage.uploadProjectDocument(reportFile, 'test_report', item.id, 'QA/QC Team', `${isFailed ? ncrNum : 'PASS'}: ${item.qa_item}`);
        report_storage_path = uploaded.storage_path || '';
        report_url = uploaded.url || '';
      } catch (error) {
        window.alert(error instanceof Error ? error.message : 'Could not upload the inspection report.');
        return;
      }
    }
    onUpdateQAQC({
      ...item,
      status,
      ncr_number: ncrNum,
      ncr_code: ncrNum,
      ncr_open_days: isFailed ? 1 : 0,
      test_result_details: isFailed ? 'Inspection failed; NCR and supporting test report registered.' : 'Passed required specification bounds; test report registered.',
      report_storage_path,
      report_url,
    });
    setResultFiles(files => ({ ...files, [item.id]: null }));
    alert(`Inspection marked as ${status}.`);
    });
  };

  const total = qaqc.length;
  const passed = qaqc.filter(q => q.status === 'passed').length;
  const failed = qaqc.filter(q => q.status === 'failed').length;
  const pending = qaqc.filter(q => q.status === 'pending').length;

  return (
    <div className="space-y-6">
      <UploadProgress active={uploading} label="Uploading and securing the test or NCR report…" />

      {/* QA Grid summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200/90 p-5 rounded-2xl shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Total Quality Items</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 text-sm">🧪</span>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 font-mono">{total}</div>
          <div className="text-[11px] text-slate-500">Registered RFIs & quality checks</div>
        </div>

        <div className="bg-white border border-slate-200/90 p-5 rounded-2xl shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Passed Inspections</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 text-sm">✓</span>
          </div>
          <div className="text-2xl font-extrabold text-emerald-600 font-mono">{passed}</div>
          <div className="text-[11px] text-slate-500">Fully compliant with specifications</div>
        </div>

        <div className="bg-white border border-slate-200/90 p-5 rounded-2xl shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Failed / Open NCRs</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600 text-sm">⚠️</span>
          </div>
          <div className="text-2xl font-extrabold text-rose-600 font-mono">{failed}</div>
          <div className="text-[11px] text-slate-500">Non-conformance reports awaiting rectification</div>
        </div>

        <div className="bg-white border border-slate-200/90 p-5 rounded-2xl shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Pending Inspections</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600 text-sm">⏳</span>
          </div>
          <div className="text-2xl font-extrabold text-amber-600 font-mono">{pending}</div>
          <div className="text-[11px] text-slate-500">Sample testing / site audit in progress</div>
        </div>
      </div>

      {/* Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 border border-slate-200/90 rounded-2xl shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 text-sm">📋</span>
            <h2 className="text-slate-900 text-base font-bold">Request for Inspection (RFI) Register</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">Manage quality compliance, concrete tests, compaction tests, material audits and non-conformance tracking.</p>
        </div>
        {canEdit && (
          <button 
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition"
          >
            {showAddForm ? '✕ Close Form' : '+ Raise Inspection Request'}
          </button>
        )}
      </div>

      {/* Add request form */}
      {showAddForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-blue-200 p-5 rounded-2xl space-y-4 max-w-lg shadow-xs text-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="text-slate-900 font-bold text-sm">Raise Quality Inspection Request</h3>
            <span className="text-[10px] text-slate-400">RFI Protocol</span>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Inspection Item</label>
              <input
                type="text"
                placeholder="e.g. Slump test PCC bedding Pier 3 cap"
                value={qaItem}
                onChange={(e) => setQaItem(e.target.value)}
                className="w-full bg-white border border-slate-300 p-2.5 rounded-xl text-slate-900 text-xs outline-none focus:border-blue-600"
                required
              />
            </div>
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Test Standard / Grade</label>
              <input
                type="text"
                placeholder="e.g. Concrete cubes compressive strength M25"
                value={testType}
                onChange={(e) => setTestType(e.target.value)}
                className="w-full bg-white border border-slate-300 p-2.5 rounded-xl text-slate-900 text-xs outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Scheduled Date (BS)</label>
              <BsDatePicker value={inspectDate} onChange={setInspectDate} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Sample Collection (BS)</label>
                <BsDatePicker value={sampleDate} onChange={setSampleDate} />
              </div>
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Tested Date (BS)</label>
                <BsDatePicker value={testedDate} onChange={setTestedDate} />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowAddForm(false)} className="rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50 transition">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs transition">
              Save Inspection Request
            </button>
          </div>
        </form>
      )}

      {/* Register List */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-slate-900 text-sm font-bold">Quality & Material Test Registry</h3>
            <p className="mt-1 text-xs text-slate-500">Audit verification history, test lab evidence, and NCR status tracking.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {qaqc.length} Records
          </span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-3 px-3">Inspection Item Details</th>
                <th className="py-3 px-3">Test Standard</th>
                <th className="py-3 px-3 text-right">Inspection Date</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-3 text-right">NCR Code</th>
                <th className="py-3 px-3 text-right">Sample / Tested</th>
                <th className="py-3 px-3 pl-4">Audit Result Notes</th>
                <th className="py-3 px-3 text-right">Report Evidence</th>
                {canEdit && <th className="py-3 px-3 text-right pr-4">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {qaqc.map(item => (
                <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-3 font-semibold text-slate-900">{item.qa_item}</td>
                  <td className="py-3 px-3 text-slate-500">{item.test_type || 'Standard inspection'}</td>
                  <td className="py-3 px-3 text-right font-mono text-slate-600">{formatBsDate(item.inspection_date)}</td>
                  <td className="py-3 px-3 text-center">
                    <span className={`status-pill ${
                      item.status === 'passed' ? 'status-pill-completed' :
                      item.status === 'failed' ? 'status-pill-delayed' :
                      'status-pill-pending'
                    }`}>
                      <span className="status-pill-dot" />
                      {item.status.toUpperCase()}
                    </span>
                  </td>
                  <td className={`py-3 px-3 text-right font-mono font-bold ${item.ncr_number ? 'text-rose-600' : 'text-slate-400'}`}>
                    {item.ncr_code || item.ncr_number || '—'}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-slate-500 text-[11px]">
                    <div>{formatBsDate(item.sample_collection_date) || '—'}</div>
                    <div className="text-slate-400">{formatBsDate(item.tested_date)}</div>
                  </td>
                  <td className="py-3 px-3 pl-4 text-slate-600">{item.test_result_details || 'Awaiting site audit'}</td>
                  <td className={`py-3 px-3 text-right font-semibold text-xs ${item.report_storage_path || item.report_url ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {item.report_storage_path || item.report_url ? '✓ Stored' : 'Required'}
                  </td>
                  {canEdit && (
                    <td className="py-3 px-3 text-right pr-4">
                      {item.status === 'pending' ? (
                        <div className="flex min-w-52 flex-col items-end gap-2 text-[11px] font-semibold">
                          <input aria-label={`Upload report for ${item.qa_item}`} type="file" accept="application/pdf,image/*,.doc,.docx" onChange={event=>setResultFiles(files=>({...files,[item.id]:event.target.files?.[0]||null}))} className="max-w-52 text-xs" />
                          <div className="flex gap-2">
                            <button onClick={() => void handleUpdateStatus(item, 'passed')} className="rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 font-bold hover:bg-emerald-100 transition">Pass</button>
                            <button onClick={() => void handleUpdateStatus(item, 'failed')} className="rounded-lg bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 font-bold hover:bg-rose-100 transition">Fail</button>
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400 font-normal">Audited</span>
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
