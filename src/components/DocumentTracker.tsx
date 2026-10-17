import React, { useEffect, useMemo, useState } from 'react';
import { DocumentItem, isSupabaseConfigured, storage, UploadedDocument } from '../lib/storage';
import BsDatePicker from './BsDatePicker';
import { formatBsDate, todayAdDate } from '../lib/nepaliDate';
import UploadProgress from './UploadProgress';
import { useSubmissionLock } from '../lib/useSubmissionLock';
import RecordDetailsDialog from './RecordDetailsDialog';

interface Props {
  userRole: string;
  projectId: string;
  userName: string;
  userEmail: string;
}

const CATEGORIES: Array<{ value: DocumentItem['category']; label: string; requiresFile?: boolean }> = [
  { value: 'compliance_report', label: 'Compliance Report', requiresFile: true },
  { value: 'ipc_claim', label: 'IPC Claim', requiresFile: true },
  { value: 'ipc_certificate', label: 'IPC Certificate', requiresFile: true },
  { value: 'payment_proof', label: 'Payment Proof', requiresFile: true },
  { value: 'quality_report', label: 'Quality / Test Report', requiresFile: true },
  { value: 'safety_report', label: 'Safety / EHS Report', requiresFile: true },
  { value: 'contract', label: 'Contract / Agreement', requiresFile: true },
  { value: 'security', label: 'Security / Guarantee', requiresFile: true },
  { value: 'insurance', label: 'Insurance Policy', requiresFile: true },
  { value: 'permit', label: 'Permit / Licence', requiresFile: true },
  { value: 'rfi', label: 'Request for Information' },
  { value: 'notice', label: 'Contractual Notice' },
  { value: 'approval', label: 'Approval / Consent' },
  { value: 'variation', label: 'Variation / EOT' },
  { value: 'handover', label: 'Handover Record', requiresFile: true },
  { value: 'other', label: 'Other' },
];

const DEFAULT_DOCUMENTS: DocumentItem[] = [
  {
    id: 'doc-1',
    ref_number: 'BT-KFT-CTR-001',
    title: 'Conditions of Contract and signed agreement',
    category: 'contract',
    version: 'Rev 0',
    submitted_date: '2025-01-05',
    action_date: '2025-01-10',
    status: 'approved',
    owner: 'Project Director',
    remarks: 'Legacy register entry; attach the signed file to close the evidence gap.',
  },
];

const blankForm = () => ({
  ref_number: '',
  title: '',
  category: 'compliance_report' as DocumentItem['category'],
  version: 'Rev 0',
  submitted_date: todayAdDate(),
  period_start: todayAdDate(),
  period_end: todayAdDate(),
  due_date: todayAdDate(),
  expiry_date: '',
  issued_by: '',
  responsible_person: '',
  linked_record_id: '',
  remarks: '',
});

export default function DocumentTracker({ userRole, projectId, userName, userEmail }: Props) {
  const [documents, setDocuments] = useState<DocumentItem[]>(() =>
    storage.getDocuments(projectId === 'proj-101' ? DEFAULT_DOCUMENTS : [])
  );
  const [form, setForm] = useState(blankForm);
  const [file, setFile] = useState<File | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filterCategory, setFilterCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [message, setMessage] = useState('');
  const [selectedDocument, setSelectedDocument] = useState<DocumentItem | null>(null);
  const { busy: saving, run: runUpload } = useSubmissionLock();

  const uploaded = storage.getUploadedDocuments();
  const ipcs = storage.getIPCs();
  const ipcPayments = storage.getIPCPayments();
  const obligations = storage.getContractObligations();
  const qaqc = storage.getQAQC();
  const safety = storage.getSafetyLogs();
  const expenses = storage.getDailyExpenses();

  const canModify = [
    'business_admin',
    'project_director',
    'project_manager',
    'planning_engineer',
    'site_engineer',
    'design_coordinator',
    'qs_billing_engineer',
    'qa_qc_engineer',
    'safety_officer',
    'store_officer',
    'accountant',
  ].includes(userRole);

  const canApprove = ['business_admin', 'project_director', 'project_manager'].includes(userRole);

  const [history, setHistory] = useState<Record<string, Array<Record<string, unknown>>>>({});
  const [, setEditingDocument] = useState<DocumentItem | null>(null);

  useEffect(() => {
    storage.saveDocuments(documents);
  }, [documents, projectId]);

  const headers = async () => ({ Authorization: `Bearer ${(await storage.getAuthSession())?.access_token || ''}`, 'Content-Type': 'application/json' });
  useEffect(() => {
    let active = true;
    void (async () => {
      if (!isSupabaseConfigured()) return;
      const response = await fetch(`/api/documents?projectId=${encodeURIComponent(projectId)}`, { headers: await headers(), cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!active) return;
      if (!response.ok) {
        if (response.status !== 401) setMessage(payload.error || 'Cloud document register is unavailable; this device copy remains available.');
        return;
      }
      setDocuments(payload.documents || []);
      setHistory((payload.history || []).reduce((grouped: Record<string, Array<Record<string, unknown>>>, row: Record<string, unknown>) => ({ ...grouped, [String(row.document_id)]: [...(grouped[String(row.document_id)] || []), row] }), {}));
    })();
    return () => { active = false; };
  }, [projectId]);
  const command = async (body: Record<string, unknown>, method: 'POST' | 'PATCH') => {
    if (!isSupabaseConfigured()) return null;
    const response = await fetch('/api/documents', { method, headers: await headers(), body: JSON.stringify({ projectId, ...body }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Controlled document could not be saved.');
    return payload.document as DocumentItem;
  };
  const editDocument = (doc: DocumentItem) => {
    setEditingDocument(doc);
    setForm({ ref_number: doc.ref_number, title: doc.title, category: doc.category, version: doc.version, submitted_date: doc.submitted_date, period_start: doc.period_start || '', period_end: doc.period_end || '', due_date: doc.due_date || '', expiry_date: doc.expiry_date || '', issued_by: doc.issued_by || '', responsible_person: doc.responsible_person || '', linked_record_id: doc.linked_record_id || '', remarks: doc.remarks || '' });
    setShowForm(true);
    setMessage('Editing a draft/rejected document. Approved records remain immutable.');
  };

  const linkOptions = useMemo(
    () => [
      ...ipcs.map(ipc => ({ id: ipc.id, label: `IPC #${ipc.ipc_number}` })),
      ...obligations.map(item => ({ id: item.id, label: `Obligation: ${item.reference}` })),
      ...qaqc.map((item: Record<string, unknown>) => ({
        id: String(item.id),
        label: `QA/QC: ${item.ncr_code || item.ncr_number || item.qa_item || item.id}`,
      })),
      ...safety.map((item: Record<string, unknown>) => ({
        id: String(item.id),
        label: `Safety log: ${formatBsDate(String(item.log_date))}`,
      })),
    ],
    [ipcs, obligations, qaqc, safety]
  );

  const readiness = useMemo(() => {
    const issues: Array<{ module: string; item: string; missing: string }> = [];
    const hasLinkedUpload = (id: string, categories?: UploadedDocument['category'][]) =>
      uploaded.some(
        row =>
          row.linked_record_id === id &&
          (!categories || categories.includes(row.category)) &&
          (row.storage_path || row.url)
      );

    ipcs.forEach(ipc => {
      if (!ipc.claim_document_path && !hasLinkedUpload(ipc.id, ['ipc_claim'])) {
        issues.push({ module: 'IPC', item: `IPC #${ipc.ipc_number}`, missing: 'Claim file' });
      }
      if (!ipc.certificate_document_path && !hasLinkedUpload(ipc.id, ['ipc_certificate']) && ipc.status !== 'pending') {
        issues.push({ module: 'IPC', item: `IPC #${ipc.ipc_number}`, missing: 'Certificate file' });
      }
      if (['paid', 'partially_paid'].includes(ipc.status) && !ipcPayments.some(row => row.ipc_id === ipc.id && row.proof_storage_path)) {
        issues.push({ module: 'IPC', item: `IPC #${ipc.ipc_number}`, missing: 'Payment proof' });
      }
    });

    documents
      .filter(doc =>
        [
          'compliance_report',
          'contract',
          'security',
          'insurance',
          'permit',
          'quality_report',
          'safety_report',
          'handover',
        ].includes(doc.category)
      )
      .forEach(doc => {
        if (!doc.storage_path && !doc.url && !hasLinkedUpload(doc.id)) {
          issues.push({ module: 'Documents', item: doc.ref_number, missing: 'Uploaded file' });
        }
        if (doc.expiry_date && doc.expiry_date < todayAdDate()) {
          issues.push({ module: 'Documents', item: doc.ref_number, missing: 'Renew expired record' });
        }
      });

    obligations
      .filter(item => item.status === 'complied')
      .forEach(item => {
        if (!item.evidence_document_path && !hasLinkedUpload(item.id)) {
          issues.push({ module: 'Contracts', item: item.reference, missing: 'Compliance evidence' });
        }
      });

    qaqc
      .filter((item: Record<string, unknown>) => item.status === 'failed')
      .forEach((item: Record<string, unknown>) => {
        if (!item.ncr_code && !item.ncr_number) {
          issues.push({ module: 'QA/QC', item: String(item.qa_item || item.id), missing: 'NCR code' });
        }
        if (
          !item.report_storage_path &&
          !hasLinkedUpload(String(item.id), ['test_report', 'compliance_report'])
        ) {
          issues.push({
            module: 'QA/QC',
            item: String(item.ncr_code || item.ncr_number || item.id),
            missing: 'Test/NCR report',
          });
        }
      });

    safety
      .filter(
        (item: Record<string, unknown>) =>
          Number(item.incidents || 0) > 0 || Number(item.environmental_complaints || 0) > 0
      )
      .forEach((item: Record<string, unknown>) => {
        if (!item.compliance_report_path && !hasLinkedUpload(String(item.id), ['compliance_report', 'report'])) {
          issues.push({
            module: 'Safety',
            item: formatBsDate(String(item.log_date)),
            missing: 'Incident/compliance report',
          });
        }
      });

    expenses
      .filter(item => item.status === 'approved' && !item.payment_slip_path)
      .forEach(item => {
        issues.push({
          module: 'Expenses',
          item: item.reference || item.description,
          missing: 'Payment slip',
        });
      });

    return issues;
  }, [documents, expenses, ipcPayments, ipcs, obligations, qaqc, safety, uploaded]);

  const handleAdd = async (event: React.FormEvent) => {
    event.preventDefault();
    const category = CATEGORIES.find(item => item.value === form.category);
    if (category?.requiresFile && !file) {
      return setMessage(`Upload the ${category.label.toLowerCase()} file before saving.`);
    }
    if (
      form.category === 'compliance_report' &&
      (!form.period_start || !form.period_end || !form.due_date || !form.issued_by || !form.responsible_person)
    ) {
      return setMessage('Compliance reports require period, due date, issuing authority and responsible person.');
    }
    if (form.period_end && form.period_start && form.period_end < form.period_start) {
      return setMessage('Reporting period end cannot be before its start.');
    }

    await runUpload(async () => {
      try {
        const id = `doc-${Date.now()}`;
        let storage_path = '';
        let url = '';
        if (file) {
          const uploadCategory = categoryToUpload(form.category);
          const saved = await storage.uploadProjectDocument(
            file,
            uploadCategory,
            form.linked_record_id || id,
            userName,
            `${form.ref_number}: ${form.title}`
          );
          storage_path = saved.storage_path || '';
          url = saved.url || '';
        }
        const record: DocumentItem = {
          id,
          project_id: projectId,
          ...form,
          action_date: null,
          status: 'draft',
          owner: userName,
          period_start: form.period_start || null,
          period_end: form.period_end || null,
          due_date: form.due_date || null,
          expiry_date: form.expiry_date || null,
          issued_by: form.issued_by || null,
          responsible_person: form.responsible_person || null,
          linked_record_id: form.linked_record_id || null,
          storage_path,
          url,
          uploaded_by: userName,
          uploaded_by_email: userEmail,
        };
        const next = [record, ...documents];
        storage.saveDocuments(next);
        setDocuments(next);
        setForm(blankForm());
        setFile(null);
        setShowForm(false);
        setMessage('Controlled document registered with private evidence.');
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Could not store the document.');
      }
    });
  };

  const updateStatus = (id: string, status: DocumentItem['status']) => {
    const next = documents.map(item => (item.id === id ? { ...item, status, action_date: todayAdDate() } : item));
    storage.saveDocuments(next);
    setDocuments(next);
  };

  const openFile = async (doc: DocumentItem) => {
    setMessage('');
    try {
      const target =
        doc.url ||
        (doc.storage_path ? await storage.getPrivateDocumentUrl(doc.storage_path, categoryToUpload(doc.category)) : '');
      if (!target) return setMessage('This legacy register row has no retrievable file. Upload a revised record.');
      window.open(target, '_blank', 'noopener,noreferrer');
      setMessage('Private file access link generated. It expires automatically.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not open the private file.');
    }
  };

  const filtered = documents.filter(
    doc =>
      (filterCategory === 'all' || doc.category === filterCategory) &&
      (!searchQuery ||
        `${doc.ref_number} ${doc.title} ${doc.owner}`.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const stats = {
    total: documents.length,
    approved: documents.filter(item => item.status === 'approved').length,
    review: documents.filter(item => item.status === 'under_review').length,
    gaps: readiness.length,
  };

  return (
    <div className="space-y-6">
      <UploadProgress active={saving} label="Uploading and securing the controlled document…" />

      {/* 1. Command Banner */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 text-sm">📁</span>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Contractual Governance</span>
          </div>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">Compliance &amp; Document Register</h1>
          <p className="mt-1 text-xs md:text-sm text-slate-600 max-w-2xl leading-relaxed">
            Controlled register for contractual agreements, insurances, bank guarantees, compliance reports, and authority consents with private file encryption.
          </p>
        </div>
        {canModify && (
          <button
            type="button"
            onClick={() => setShowForm(v => !v)}
            className="self-start md:self-auto px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center gap-1.5"
          >
            <span>{showForm ? '✕ Close Form' : '+ Register Document'}</span>
          </button>
        )}
      </section>

      {/* 2. KPI Summary Cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Documents</span>
            <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center text-sm">📄</span>
          </div>
          <div className="mt-3">
            <div className="text-2xl md:text-3xl font-black text-slate-900">{stats.total}</div>
            <div className="text-[11px] text-slate-500 mt-1">Controlled records</div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Approved &amp; Active</span>
            <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center text-sm">✓</span>
          </div>
          <div className="mt-3">
            <div className="text-2xl md:text-3xl font-black text-emerald-600">{stats.approved}</div>
            <div className="text-[11px] text-slate-500 mt-1">Formally signed off</div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Under Review</span>
            <span className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center text-sm">⏳</span>
          </div>
          <div className="mt-3">
            <div className="text-2xl md:text-3xl font-black text-amber-600">{stats.review}</div>
            <div className="text-[11px] text-slate-500 mt-1">Pending approval</div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Evidence Gaps</span>
            <span className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center text-sm">⚠️</span>
          </div>
          <div className="mt-3">
            <div className={`text-2xl md:text-3xl font-black ${stats.gaps > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              {stats.gaps}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {stats.gaps > 0 ? 'Audit items need proof' : 'All requirements met'}
            </div>
          </div>
        </div>
      </section>

      {/* 3. Readiness Audit Alert Box */}
      <section
        className={`rounded-2xl border p-5 shadow-xs ${
          readiness.length > 0 ? 'border-amber-200 bg-amber-50/70' : 'border-emerald-200 bg-emerald-50/70'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">{readiness.length > 0 ? '🛡️' : '✅'}</span>
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">
                Project Evidence Audit &amp; Readiness Check
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Continuously scans IPC proofs, contract closures, failed QA/NCR reports, and approved expense vouchers.
              </p>
            </div>
          </div>
          <span
            className={`self-start sm:self-auto px-3 py-1 rounded-full text-xs font-black uppercase ${
              readiness.length > 0
                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
            }`}
          >
            {readiness.length > 0 ? `${readiness.length} missing file(s)` : '100% Compliant'}
          </span>
        </div>

        {readiness.length > 0 && (
          <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {readiness.map((issue, index) => (
              <div
                key={`${issue.module}-${issue.item}-${index}`}
                className="rounded-xl border border-amber-200 bg-white p-3 shadow-2xs text-xs"
              >
                <div className="font-bold text-slate-900 flex items-center justify-between">
                  <span>{issue.module} · {issue.item}</span>
                  <span className="text-[10px] font-bold text-rose-600 uppercase bg-rose-50 px-1.5 py-0.2 rounded">
                    Missing
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-rose-700 font-medium">{issue.missing}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Message Banner */}
      {message && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/80 p-3.5 text-xs font-semibold text-blue-900 flex items-center justify-between">
          <span>{message}</span>
          <button onClick={() => setMessage('')} className="text-blue-600 hover:text-blue-800 text-xs font-bold">Dismiss</button>
        </div>
      )}

      {/* 4. Register Document Form */}
      {showForm && (
        <form onSubmit={handleAdd} className="rounded-2xl border border-blue-200 bg-white p-5 md:p-6 shadow-md space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">Register Controlled Document</h3>
              <p className="text-xs text-slate-500">Provide official metadata, validity period, and attach private evidence</p>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 uppercase">Controlled Entry</span>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Reference Number <span className="text-rose-500">*</span>
              </label>
              <input
                required
                value={form.ref_number}
                onChange={e => setForm({ ...form, ref_number: e.target.value })}
                placeholder="e.g., KFT-PLN-REP-004"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Document Category <span className="text-rose-500">*</span>
              </label>
              <select
                value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value as DocumentItem['category'] })}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500"
              >
                {CATEGORIES.map(item => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Revision / Version <span className="text-rose-500">*</span>
              </label>
              <input
                required
                value={form.version}
                onChange={e => setForm({ ...form, version: e.target.value })}
                placeholder="Rev 0 / Final"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Document Title <span className="text-rose-500">*</span>
              </label>
              <input
                required
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="Environmental Management Compliance Report - Q1"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Link to Project Record
              </label>
              <select
                value={form.linked_record_id}
                onChange={e => setForm({ ...form, linked_record_id: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500"
              >
                <option value="">No Linked Record</option>
                {linkOptions.map(item => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Submitted Date (BS) <span className="text-rose-500">*</span>
              </label>
              <BsDatePicker
                required
                value={form.submitted_date}
                onChange={submitted_date => setForm({ ...form, submitted_date })}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Action / Due Date (BS)
              </label>
              <BsDatePicker
                value={form.due_date}
                onChange={due_date => setForm({ ...form, due_date })}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Expiry / Valid Until (BS)
              </label>
              <BsDatePicker
                value={form.expiry_date}
                onChange={expiry_date => setForm({ ...form, expiry_date })}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Issued By / Authority
              </label>
              <input
                value={form.issued_by}
                onChange={e => setForm({ ...form, issued_by: e.target.value })}
                placeholder="Consultant Engineer / Municipality"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Responsible Person
              </label>
              <input
                value={form.responsible_person}
                onChange={e => setForm({ ...form, responsible_person: e.target.value })}
                placeholder="EHS Officer / Project Manager"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Attach Evidence Document
              </label>
              <input
                type="file"
                accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx,.csv"
                onChange={e => setFile(e.target.files?.[0] || null)}
                className="w-full text-xs text-slate-600 file:mr-2 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              disabled={saving}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition shadow-xs disabled:opacity-50"
            >
              {saving ? 'Uploading Document…' : '✓ Save Controlled Document'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* 5. Filter Toolbar & Documents Table */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          {/* Category Tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setFilterCategory('all')}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition ${
                filterCategory === 'all'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Types
            </button>
            {CATEGORIES.slice(0, 7).map(item => (
              <button
                key={item.value}
                onClick={() => setFilterCategory(item.value)}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-xl transition whitespace-nowrap ${
                  filterCategory === item.value
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative">
            <span className="absolute left-2.5 top-2 text-xs text-slate-400">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search reference, title, owner..."
              className="pl-7 pr-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500 w-full sm:w-64"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-500 font-bold uppercase text-[10px] tracking-wider text-left">
                <th className="py-2.5 px-3">Reference &amp; Rev</th>
                <th className="py-2.5 px-3">Document Title</th>
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3">Submitted (BS)</th>
                <th className="py-2.5 px-3">Expiry (BS)</th>
                <th className="py-2.5 px-3">Author / Authority</th>
                <th className="py-2.5 px-3">Private Evidence</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <div className="text-2xl mb-1">📁</div>
                    No documents matching the current filter.
                  </td>
                </tr>
              ) : (
                filtered.map(doc => {
                  const isExpired = doc.expiry_date && doc.expiry_date < todayAdDate();
                  return (
                    <tr key={doc.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3 font-mono font-bold text-slate-900">
                        {doc.ref_number}
                        <div className="text-[10px] font-normal text-slate-500">{doc.version}</div>
                      </td>
                      <td className="py-3 px-3 font-medium text-slate-900 max-w-[240px]">
                        <div className="truncate font-semibold">{doc.title}</div>
                        {doc.remarks && (
                          <div className="text-[10px] text-slate-500 mt-0.5 truncate">{doc.remarks}</div>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 capitalize">
                          {doc.category.replaceAll('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono">
                        <div>{formatBsDate(doc.submitted_date)}</div>
                        {doc.due_date && (
                          <div className="text-[10px] text-slate-500">Due {formatBsDate(doc.due_date)}</div>
                        )}
                      </td>
                      <td className={`py-3 px-3 font-mono ${isExpired ? 'font-bold text-rose-600' : ''}`}>
                        {doc.expiry_date ? formatBsDate(doc.expiry_date) : '—'}
                        {isExpired && <span className="block text-[9px] uppercase font-bold text-rose-500">Expired</span>}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-medium text-slate-800">{doc.owner}</div>
                        <div className="text-[10px] text-slate-500">{doc.issued_by || '—'}</div>
                      </td>
                      <td className="py-3 px-3">
                        {doc.storage_path || doc.url ? (
                          <button
                            onClick={() => void openFile(doc)}
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition"
                          >
                            <span>📎</span> Open File
                          </button>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            Missing File
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <DocumentStatusBadge value={doc.status} />
                      </td>
                      <td className="py-3 px-3 text-right">
                          <div className="flex flex-wrap gap-1 justify-end">
                          <button
                            onClick={() => setSelectedDocument(doc)}
                            className="px-2 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                          >
                            View details
                          </button>
                          {canModify && ['draft', 'rejected'].includes(doc.status) && (
                            <button
                              onClick={() => editDocument(doc)}
                              className="px-2 py-1 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition"
                            >
                              Edit details
                            </button>
                          )}
                          {doc.status === 'draft' && canModify && (
                            <button
                              onClick={() => updateStatus(doc.id, 'under_review')}
                              className="px-2 py-1 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition"
                            >
                              Submit
                            </button>
                          )}
                          {doc.status === 'under_review' && canApprove && (
                            <>
                              <button
                                onClick={() => updateStatus(doc.id, 'approved')}
                                className="px-2 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => updateStatus(doc.id, 'rejected')}
                                className="px-2 py-1 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg transition"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {doc.status === 'rejected' && canModify && (
                            <button
                              onClick={() => updateStatus(doc.id, 'under_review')}
                              className="px-2 py-1 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg transition"
                            >
                              Resubmit
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Record Details Dialog */}
      <RecordDetailsDialog
        title="Controlled Document Information"
        record={selectedDocument}
        onClose={() => setSelectedDocument(null)}
      />
    </div>
  );
}

function categoryToUpload(category: DocumentItem['category']): UploadedDocument['category'] {
  if (category === 'ipc_claim') return 'ipc_claim';
  if (category === 'ipc_certificate') return 'ipc_certificate';
  if (category === 'payment_proof') return 'ipc_payment';
  if (category === 'compliance_report') return 'compliance_report';
  if (['quality_report', 'safety_report', 'test_record'].includes(category)) return 'test_report';
  if (category === 'contract') return 'contract';
  return 'report';
}

function DocumentStatusBadge({ value }: { value: string }) {
  if (value === 'approved') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        Approved
      </span>
    );
  }
  if (value === 'rejected') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 uppercase">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
        Rejected
      </span>
    );
  }
  if (value === 'under_review') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 uppercase">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
        In Review
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 uppercase">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
      Draft
    </span>
  );
}
