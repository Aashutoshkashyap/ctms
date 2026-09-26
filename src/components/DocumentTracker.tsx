import React, { useEffect, useMemo, useState } from 'react';
import { DocumentItem, isSupabaseConfigured, storage, UploadedDocument } from '../lib/storage';
import BsDatePicker from './BsDatePicker';
import { formatBsDate, todayAdDate } from '../lib/nepaliDate';
import UploadProgress from './UploadProgress';
import { useSubmissionLock } from '../lib/useSubmissionLock';
import RecordDetailsDialog from './RecordDetailsDialog';

interface Props { userRole: string; projectId: string; userName: string; userEmail: string; }

const CATEGORIES: Array<{ value: DocumentItem['category']; label: string; requiresFile?: boolean }> = [
  { value: 'compliance_report', label: 'Compliance Report', requiresFile: true },
  { value: 'ipc_claim', label: 'IPC Claim', requiresFile: true },
  { value: 'ipc_certificate', label: 'IPC Certificate', requiresFile: true },
  { value: 'payment_proof', label: 'Payment Proof', requiresFile: true },
  { value: 'quality_report', label: 'Quality / Test Report', requiresFile: true },
  { value: 'safety_report', label: 'Safety / EHS Report', requiresFile: true },
  { value: 'contract', label: 'Contract / Agreement', requiresFile: true },
  { value: 'security', label: 'Security / Guarantee', requiresFile: true },
  { value: 'insurance', label: 'Insurance', requiresFile: true },
  { value: 'permit', label: 'Permit / Licence', requiresFile: true },
  { value: 'rfi', label: 'Request for Information' },
  { value: 'notice', label: 'Contractual Notice' },
  { value: 'approval', label: 'Approval / Consent' },
  { value: 'variation', label: 'Variation / EOT' },
  { value: 'handover', label: 'Handover Record', requiresFile: true },
  { value: 'other', label: 'Other' },
];

const DEFAULT_DOCUMENTS: DocumentItem[] = [{
  id: 'doc-1', ref_number: 'BT-KFT-CTR-001', title: 'Conditions of Contract and signed agreement', category: 'contract',
  version: 'Rev 0', submitted_date: '2025-01-05', action_date: '2025-01-10', status: 'approved', owner: 'Project Director',
  remarks: 'Legacy register entry; attach the signed file to close the evidence gap.',
}];

const blankForm = () => ({
  ref_number: '', title: '', category: 'compliance_report' as DocumentItem['category'], version: 'Rev 0',
  submitted_date: todayAdDate(), period_start: todayAdDate(), period_end: todayAdDate(), due_date: todayAdDate(), expiry_date: '',
  issued_by: '', responsible_person: '', linked_record_id: '', remarks: '',
});

export default function DocumentTracker({ userRole, projectId, userName, userEmail }: Props) {
  const [documents, setDocuments] = useState<DocumentItem[]>(() => storage.getDocuments(projectId === 'proj-101' ? DEFAULT_DOCUMENTS : []));
  const [form, setForm] = useState(blankForm);
  const [file, setFile] = useState<File | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingDocument, setEditingDocument] = useState<DocumentItem | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<DocumentItem | null>(null);
  const [history, setHistory] = useState<Record<string, Array<Record<string, unknown>>>>({});
  const [filterCategory, setFilterCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [message, setMessage] = useState('');
  const { busy: saving, run: runUpload } = useSubmissionLock();
  const uploaded = storage.getUploadedDocuments();
  const ipcs = storage.getIPCs();
  const ipcPayments = storage.getIPCPayments();
  const obligations = storage.getContractObligations();
  const qaqc = storage.getQAQC();
  const safety = storage.getSafetyLogs();
  const expenses = storage.getDailyExpenses();
  const canModify = ['business_admin','project_director','project_manager','planning_engineer','site_engineer','design_coordinator','qs_billing_engineer','qa_qc_engineer','safety_officer','store_officer','accountant'].includes(userRole);
  const canApprove = ['business_admin','project_director','project_manager'].includes(userRole);

  useEffect(() => { storage.saveDocuments(documents); }, [documents, projectId]);
  const headers = async () => ({ Authorization: `Bearer ${(await storage.getAuthSession())?.access_token || ''}`, 'Content-Type': 'application/json' });
  const loadAuthoritative = async () => {
    if (!isSupabaseConfigured()) return;
    const response = await fetch(`/api/documents?projectId=${encodeURIComponent(projectId)}`, { headers: await headers(), cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { if (response.status !== 401) setMessage(payload.error || 'Cloud document register is unavailable; this device copy remains available.'); return; }
    setDocuments(payload.documents || []);
    setHistory((payload.history || []).reduce((grouped: Record<string, Array<Record<string, unknown>>>, row: Record<string, unknown>) => ({ ...grouped, [String(row.document_id)]: [...(grouped[String(row.document_id)] || []), row] }), {}));
  };
  // Server records are authoritative when connected; local storage remains the offline fallback.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadAuthoritative(); }, [projectId]);
  const command = async (body: Record<string, unknown>, method: 'POST' | 'PATCH') => {
    if (!isSupabaseConfigured()) return null;
    const response = await fetch('/api/documents', { method, headers: await headers(), body: JSON.stringify({ projectId, ...body }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Controlled document could not be saved.');
    return payload.document as DocumentItem;
  };

  const linkOptions = useMemo(() => [
    ...ipcs.map(ipc => ({ id: ipc.id, label: `IPC #${ipc.ipc_number}` })),
    ...obligations.map(item => ({ id: item.id, label: `Obligation: ${item.reference}` })),
    ...qaqc.map((item: Record<string, unknown>) => ({ id: String(item.id), label: `QA/QC: ${item.ncr_code || item.ncr_number || item.qa_item || item.id}` })),
    ...safety.map((item: Record<string, unknown>) => ({ id: String(item.id), label: `Safety log: ${formatBsDate(String(item.log_date))}` })),
  ].map(item => ({ ...item, value: item.id })), [ipcs, obligations, qaqc, safety]);

  const readiness = useMemo(() => {
    const issues: Array<{ module: string; item: string; missing: string }> = [];
    const hasLinkedUpload = (id: string, categories?: UploadedDocument['category'][]) => uploaded.some(row => row.linked_record_id === id && (!categories || categories.includes(row.category)) && (row.storage_path || row.url));
    ipcs.forEach(ipc => {
      if (!ipc.claim_document_path && !hasLinkedUpload(ipc.id, ['ipc_claim'])) issues.push({ module: 'IPC', item: `IPC #${ipc.ipc_number}`, missing: 'Claim file' });
      if (ipc.status !== 'pending' && !ipc.certificate_document_path && !hasLinkedUpload(ipc.id, ['ipc_certificate'])) issues.push({ module: 'IPC', item: `IPC #${ipc.ipc_number}`, missing: 'Certificate file' });
      if (['paid','partially_paid'].includes(ipc.status) && !ipcPayments.some(row => row.ipc_id === ipc.id && row.proof_storage_path)) issues.push({ module: 'IPC', item: `IPC #${ipc.ipc_number}`, missing: 'Payment proof' });
    });
    documents.filter(doc => ['compliance_report','contract','security','insurance','permit','quality_report','safety_report','handover'].includes(doc.category)).forEach(doc => {
      if (!doc.storage_path && !doc.url && !hasLinkedUpload(doc.id)) issues.push({ module: 'Documents', item: doc.ref_number, missing: 'Uploaded file' });
      if (doc.expiry_date && doc.expiry_date < todayAdDate()) issues.push({ module: 'Documents', item: doc.ref_number, missing: 'Renew expired record' });
    });
    obligations.filter(item => item.status === 'complied').forEach(item => {
      if (!item.evidence_document_path && !hasLinkedUpload(item.id)) issues.push({ module: 'Contracts', item: item.reference, missing: 'Compliance evidence' });
    });
    qaqc.filter((item: Record<string, unknown>) => item.status === 'failed').forEach((item: Record<string, unknown>) => {
      if (!item.ncr_code && !item.ncr_number) issues.push({ module: 'QA/QC', item: String(item.qa_item || item.id), missing: 'NCR code' });
      if (!item.report_storage_path && !hasLinkedUpload(String(item.id), ['test_report','compliance_report'])) issues.push({ module: 'QA/QC', item: String(item.ncr_code || item.ncr_number || item.id), missing: 'Test/NCR report' });
    });
    safety.filter((item: Record<string, unknown>) => Number(item.incidents || 0) > 0 || Number(item.environmental_complaints || 0) > 0).forEach((item: Record<string, unknown>) => {
      if (!item.compliance_report_path && !hasLinkedUpload(String(item.id), ['compliance_report','report'])) issues.push({ module: 'Safety', item: formatBsDate(String(item.log_date)), missing: 'Incident/compliance report' });
    });
    expenses.filter(item => item.status === 'approved' && !item.payment_slip_path).forEach(item => issues.push({ module: 'Expenses', item: item.reference || item.description, missing: 'Payment slip' }));
    return issues;
  }, [documents, expenses, ipcPayments, ipcs, obligations, qaqc, safety, uploaded]);

  const handleAdd = async (event: React.FormEvent) => {
    event.preventDefault();
    const category = CATEGORIES.find(item => item.value === form.category);
    if (category?.requiresFile && !file) return setMessage(`Upload the ${category.label.toLowerCase()} file before saving.`);
    if (form.category === 'compliance_report' && (!form.period_start || !form.period_end || !form.due_date || !form.issued_by || !form.responsible_person)) return setMessage('Compliance reports require period, due date, issuing authority and responsible person.');
    if (form.period_end && form.period_start && form.period_end < form.period_start) return setMessage('Reporting period end cannot be before its start.');
    await runUpload(async () => { try {
      const id = `doc-${Date.now()}`;
      let storage_path = ''; let url = '';
      if (file) {
        const uploadCategory = categoryToUpload(form.category);
        const saved = await storage.uploadProjectDocument(file, uploadCategory, form.linked_record_id || id, userName, `${form.ref_number}: ${form.title}`);
        storage_path = saved.storage_path || ''; url = saved.url || '';
      }
      const record: DocumentItem = {
        id, project_id: projectId, ...form, action_date: null, status: 'draft', owner: userName,
        period_start: form.period_start || null, period_end: form.period_end || null, due_date: form.due_date || null,
        expiry_date: form.expiry_date || null, issued_by: form.issued_by || null, responsible_person: form.responsible_person || null,
        linked_record_id: form.linked_record_id || null, storage_path, url, uploaded_by: userName, uploaded_by_email: userEmail,
      };
      const saved = editingDocument
        ? await command({ action: 'update', documentId: editingDocument.id, document: { ...record, id: editingDocument.id } }, 'PATCH')
        : await command({ document: record }, 'POST');
      const confirmed = saved ? { ...record, ...saved, storage_path, url } : record;
      setDocuments(rows => editingDocument ? rows.map(item => item.id === editingDocument.id ? confirmed : item) : [confirmed, ...rows]);
      setForm(blankForm()); setFile(null); setShowForm(false); setEditingDocument(null); setMessage(saved ? 'Controlled document saved to the authorized project register.' : 'Document saved on this device and will sync when cloud access is available.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not store the document.'); } });
  };

  const updateStatus = async (id: string, status: DocumentItem['status']) => {
    try {
      const saved = await command({ documentId: id, action: status }, 'PATCH');
      if (!saved) throw new Error('Sign in to change a controlled document status.');
      setDocuments(rows => rows.map(item => item.id === id ? { ...item, ...saved } : item));
      await loadAuthoritative(); setMessage(`Document marked ${status.replaceAll('_', ' ')}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Document status could not be changed.'); }
  };

  const editDocument = (doc: DocumentItem) => {
    setEditingDocument(doc); setForm({ ref_number: doc.ref_number, title: doc.title, category: doc.category, version: doc.version, submitted_date: doc.submitted_date, period_start: doc.period_start || '', period_end: doc.period_end || '', due_date: doc.due_date || '', expiry_date: doc.expiry_date || '', issued_by: doc.issued_by || '', responsible_person: doc.responsible_person || '', linked_record_id: doc.linked_record_id || '', remarks: doc.remarks || '' }); setShowForm(true); setMessage('Editing a draft/rejected document. Approved records remain immutable.');
  };

  const openFile = async (doc: DocumentItem) => {
    setMessage('');
    try {
      const uploadedRecord = uploaded.find(item => item.linked_record_id === doc.id && (item.storage_path || item.url));
      const target = doc.url || uploadedRecord?.url || (doc.storage_path ? await storage.getPrivateDocumentUrl(doc.storage_path, categoryToUpload(doc.category)) : uploadedRecord?.storage_path ? await storage.getPrivateDocumentUrl(uploadedRecord.storage_path, uploadedRecord.category) : '');
      if (!target) return setMessage('This legacy register row has no retrievable file. Upload a revised record.');
      window.open(target, '_blank', 'noopener,noreferrer');
      setMessage('Private file access link generated. It expires automatically.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not open the private file.'); }
  };

  const filtered = documents.filter(doc => (filterCategory === 'all' || doc.category === filterCategory) && (!searchQuery || `${doc.ref_number} ${doc.title} ${doc.owner}`.toLowerCase().includes(searchQuery.toLowerCase())));
  const stats = { total: documents.length, approved: documents.filter(item => item.status === 'approved').length, review: documents.filter(item => item.status === 'under_review').length, gaps: readiness.length };

  return <div className="space-y-5"><UploadProgress active={saving} label="Uploading and securing the controlled document…"/>
    <div className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center"><div><h2 className="text-base font-bold text-slate-950">Compliance & Document Register</h2><p className="text-sm text-slate-600">Required metadata, reporting periods, expiry control, approval status and private source files.</p></div>{canModify&&<button type="button" aria-expanded={showForm} onClick={()=>setShowForm(value=>!value)} className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-bold text-white">+ Register document</button>}</div>
    <div className="grid gap-3 sm:grid-cols-4"><Metric label="Documents" value={stats.total}/><Metric label="Approved" value={stats.approved}/><Metric label="Under review" value={stats.review}/><Metric label="Required gaps" value={stats.gaps} warning={stats.gaps>0}/></div>
    {message&&<div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-950">{message}</div>}

    <section className={`rounded-xl border p-4 shadow-sm ${readiness.length?'border-amber-200 bg-amber-50':'border-emerald-200 bg-emerald-50'}`}><div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center"><div><h3 className="font-bold text-slate-950">Required records readiness check</h3><p className="text-sm text-slate-700">Checks IPC evidence, compliance files, contract closure evidence, failed QA/NCR reports, incident reports and approved expense slips.</p></div><span className={`rounded-full px-3 py-1 text-sm font-extrabold ${readiness.length?'bg-amber-100 text-amber-900':'bg-emerald-100 text-emerald-900'}`}>{readiness.length ? `${readiness.length} gap(s)` : 'Complete'}</span></div>{readiness.length>0&&<div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{readiness.map((issue,index)=><div key={`${issue.module}-${issue.item}-${index}`} className="rounded-lg border border-amber-200 bg-white p-3 text-sm"><b className="text-slate-950">{issue.module} · {issue.item}</b><div className="mt-1 text-rose-800">Missing: {issue.missing}</div></div>)}</div>}</section>

    {showForm&&<form onSubmit={handleAdd} className="rounded-xl border border-blue-200 bg-white p-5 shadow-sm"><div><h3 className="font-bold text-slate-950">{editingDocument ? 'Edit controlled document' : 'Register a controlled document'}</h3><p className="text-sm text-slate-600">Compliance reports and formal evidence types require a file.</p></div><div className="mt-4 grid gap-3 md:grid-cols-3"><Field label="Reference number"><input required value={form.ref_number} onChange={event=>setForm({...form,ref_number:event.target.value})}/></Field><Field label="Category"><select value={form.category} onChange={event=>setForm({...form,category:event.target.value as DocumentItem['category']})}>{CATEGORIES.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select></Field><Field label="Version"><input required value={form.version} onChange={event=>setForm({...form,version:event.target.value})}/></Field><Field label="Title"><input required value={form.title} onChange={event=>setForm({...form,title:event.target.value})}/></Field><Field label="Submitted date (BS)"><BsDatePicker required value={form.submitted_date} onChange={submitted_date=>setForm({...form,submitted_date})}/></Field><Field label="Due date (BS)"><BsDatePicker value={form.due_date} onChange={due_date=>setForm({...form,due_date})}/></Field><Field label="Reporting period start (BS)"><BsDatePicker value={form.period_start} onChange={period_start=>setForm({...form,period_start})}/></Field><Field label="Reporting period end (BS)"><BsDatePicker value={form.period_end} onChange={period_end=>setForm({...form,period_end})}/></Field><Field label="Expiry / valid until (BS)"><BsDatePicker value={form.expiry_date} onChange={expiry_date=>setForm({...form,expiry_date})}/></Field><Field label="Issued by / Authority"><input value={form.issued_by} onChange={event=>setForm({...form,issued_by:event.target.value})}/></Field><Field label="Responsible person"><input value={form.responsible_person} onChange={event=>setForm({...form,responsible_person:event.target.value})}/></Field><Field label="Link to project record"><select value={form.linked_record_id} onChange={event=>setForm({...form,linked_record_id:event.target.value})}><option value="">No linked record</option>{linkOptions.map(item=><option key={item.id} value={item.value}>{item.label}</option>)}</select></Field><Field label="Upload source document"><input type="file" accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx,.csv" onChange={event=>setFile(event.target.files?.[0]||null)}/></Field><Field label="Remarks"><textarea value={form.remarks} onChange={event=>setForm({...form,remarks:event.target.value})}/></Field></div><div className="mt-4 flex gap-2"><button disabled={saving} className="rounded-lg bg-emerald-700 px-4 py-2 font-bold text-white">{saving?'Uploading…':editingDocument?'Save document changes':'Save controlled document'}</button><button type="button" onClick={()=>{setShowForm(false);setEditingDocument(null);setForm(blankForm());}} className="rounded-lg border border-slate-300 px-4 py-2 font-bold text-slate-800">Cancel</button></div></form>}

    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-col justify-between gap-3 md:flex-row md:items-center"><div className="flex flex-wrap gap-2"><button onClick={()=>setFilterCategory('all')} className={filterCategory==='all'?'filter-active':'filter-button'}>All</button>{CATEGORIES.slice(0,10).map(item=><button key={item.value} onClick={()=>setFilterCategory(item.value)} className={filterCategory===item.value?'filter-active':'filter-button'}>{item.label}</button>)}</div><input value={searchQuery} onChange={event=>setSearchQuery(event.target.value)} placeholder="Search documents…" className="w-full rounded-lg md:w-64"/></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[1200px] text-sm"><thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-600">{['Reference','Title','Category','Period (BS)','Submitted / due (BS)','Expiry (BS)','Owner / Authority','File','Status','Action'].map(title=><th key={title} className="p-2">{title}</th>)}</tr></thead><tbody>{filtered.map(doc=><tr key={doc.id} className="border-b border-slate-100"><td className="p-2 font-mono font-bold text-slate-800">{doc.ref_number}<div className="text-xs font-normal">{doc.version}</div></td><td className="p-2"><b className="text-slate-950">{doc.title}</b><div className="text-xs text-slate-600">{doc.remarks||'No remarks'}</div></td><td className="p-2 capitalize">{doc.category.replaceAll('_',' ')}</td><td className="p-2">{formatBsDate(doc.period_start)} → {formatBsDate(doc.period_end)}</td><td className="p-2">{formatBsDate(doc.submitted_date)}<div className="text-xs text-slate-600">Due {formatBsDate(doc.due_date)}</div></td><td className={`p-2 ${doc.expiry_date&&doc.expiry_date<todayAdDate()?'font-bold text-rose-800':''}`}>{formatBsDate(doc.expiry_date)}</td><td className="p-2">{doc.owner}<div className="text-xs text-slate-600">{doc.issued_by||'—'}</div></td><td className="p-2">{doc.storage_path||doc.url?<button onClick={()=>void openFile(doc)} className="font-bold text-blue-800">Open private file</button>:<span className="font-bold text-rose-800">Missing</span>}</td><td className="p-2"><Status value={doc.status}/></td><td className="p-2">{doc.status==='draft'&&canModify&&<button onClick={()=>updateStatus(doc.id,'under_review')} className="font-bold text-blue-800">Submit</button>}{doc.status==='under_review'&&canApprove&&<div className="flex gap-2"><button onClick={()=>updateStatus(doc.id,'approved')} className="font-bold text-emerald-800">Approve</button><button onClick={()=>updateStatus(doc.id,'rejected')} className="font-bold text-rose-800">Reject</button></div>}{doc.status==='rejected'&&canModify&&<button onClick={()=>updateStatus(doc.id,'under_review')} className="font-bold text-amber-800">Resubmit</button>}</td></tr>)}</tbody></table>{filtered.length===0&&<div className="p-8 text-center text-slate-600">No matching documents.</div>}</div></section>
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="font-bold text-slate-950">Document details & actions</h3>
      <p className="mt-1 text-sm text-slate-600">Open full metadata and history. Only draft or rejected records can be edited; the server verifies every action.</p>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {filtered.map(doc => <div key={`actions-${doc.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-sm"><div><b className="text-slate-950">{doc.ref_number}</b><span className="ml-2 text-slate-600">{doc.title}</span></div><div className="flex flex-wrap gap-2"><button onClick={()=>setSelectedDocument(doc)} className="font-bold text-slate-800">View details</button>{canModify&&['draft','rejected'].includes(doc.status)&&<button onClick={()=>editDocument(doc)} className="font-bold text-blue-800">Edit details</button>}</div></div>)}
      </div>
    </section>
    <RecordDetailsDialog title="Controlled document" record={selectedDocument ? { ...selectedDocument, action_history: history[selectedDocument.id] || [] } : null} onClose={()=>setSelectedDocument(null)}/>
  </div>;
}

function categoryToUpload(category: DocumentItem['category']): UploadedDocument['category'] {
  if (category === 'ipc_claim') return 'ipc_claim'; if (category === 'ipc_certificate') return 'ipc_certificate';
  if (category === 'payment_proof') return 'ipc_payment'; if (category === 'compliance_report') return 'compliance_report';
  if (['quality_report','safety_report','test_record'].includes(category)) return 'test_report'; if (category === 'contract') return 'contract';
  return 'report';
}
function Metric({label,value,warning=false}:{label:string;value:number;warning?:boolean}){return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-xs font-bold uppercase text-slate-600">{label}</div><div className={`mt-1 text-xl font-extrabold ${warning?'text-amber-800':'text-slate-950'}`}>{value}</div></div>}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="text-sm font-semibold text-slate-700">{label}<div className="mt-1">{children}</div></label>}
function Status({value}:{value:string}){const bad=value==='rejected';const good=value==='approved';return <span className={`rounded-full px-2 py-1 text-xs font-bold capitalize ${good?'bg-emerald-50 text-emerald-800':bad?'bg-rose-50 text-rose-800':'bg-amber-50 text-amber-800'}`}>{value.replaceAll('_',' ')}</span>}
