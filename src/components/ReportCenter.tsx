import React, { useMemo, useState } from 'react';
import { Activity } from '../lib/cpm';
import { EVMMetrics } from '../lib/evm';
import { storage } from '../lib/storage';

type ReportType = 'daily'|'weekly'|'monthly'|'ipc'|'claims'|'quality'|'safety'|'handover';
interface Props { project:any; activities:Activity[]; evm:EVMMetrics; dailyReports:any[]; ipc:any[]; claims:any[]; qaqc:any[]; safety:any[]; handover:any[]; }

export default function ReportCenter(props:Props){
  const [type,setType]=useState<ReportType>('monthly');
  const generated=useMemo(()=>buildReport(type,props),[type,props]);
  const download=(format:'html'|'json'|'csv')=>{
    let body='';let mime='text/plain';let ext=format;
    if(format==='html'){body=`<!doctype html><html><head><meta charset="utf-8"><title>${generated.title}</title><style>body{font-family:Arial;padding:32px;max-width:1000px;margin:auto}h1{color:#17365d}table{border-collapse:collapse;width:100%;margin:18px 0}th,td{border:1px solid #ccc;padding:8px;text-align:left}th{background:#eef3f8}.metric{display:inline-block;padding:12px;margin:4px;background:#eef3f8}</style></head><body>${generated.html}</body></html>`;mime='text/html';}
    if(format==='json'){body=JSON.stringify(generated.data,null,2);mime='application/json';}
    if(format==='csv'){const rows=generated.rows||[];body=rows.map(row=>row.map(cell=>`"${String(cell??'').replaceAll('"','""')}"`).join(',')).join('\n');mime='text/csv';}
    const url=URL.createObjectURL(new Blob([body],{type:mime}));const a=document.createElement('a');a.href=url;a.download=`${props.project.name.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}-${type}.${ext}`;a.click();URL.revokeObjectURL(url);
  };
  return <div className="space-y-5 text-xs">
    <div><h2 className="text-base font-semibold">Reports & Contract Output Center</h2><p className="text-slate-400">Generate printable and machine-readable project control packs from the live register.</p></div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">{(['daily','weekly','monthly','ipc','claims','quality','safety','handover'] as ReportType[]).map(value=><button key={value} onClick={()=>setType(value)} className={`p-3 rounded-lg border capitalize ${type===value?'bg-blue-600 border-blue-500':'bg-slate-800/50 border-slate-700 text-slate-400'}`}>{value} {value==='ipc'?'Support Pack':'Report'}</button>)}</div>
    <div className="flex gap-2"><button onClick={()=>download('html')} className="bg-emerald-600 px-3 py-2 rounded font-semibold">Download Printable HTML</button><button onClick={()=>download('csv')} className="bg-slate-700 px-3 py-2 rounded">Export CSV</button><button onClick={()=>download('json')} className="bg-slate-700 px-3 py-2 rounded">Export JSON</button></div>
    <div className="bg-white text-slate-800 rounded-xl p-6 shadow-xl min-h-[480px]" dangerouslySetInnerHTML={{__html:generated.html}}/>
  </div>;
}

function buildReport(type:ReportType,p:Props){
  const project=p.project;const now=new Date();const today=new Date(now.getTime()-now.getTimezoneOffset()*60_000).toISOString().split('T')[0];
  const head=`<h1>${project.name}</h1><p><b>${label(type)}</b> · Generated ${today}</p><p>Contract ${project.contract_number||'—'} · ${project.currency} ${Number(project.contract_amount).toLocaleString()}</p>`;
  const metrics=`<div><span class="metric">Planned ${p.evm.plannedProgress.toFixed(1)}%</span><span class="metric">Actual ${p.evm.actualProgress.toFixed(1)}%</span><span class="metric">SPI ${p.evm.spi.toFixed(2)}</span><span class="metric">CPI ${p.evm.cpi.toFixed(2)}</span></div>`;
  let rows:any[][]=[];let section='';
  if(type==='daily'){rows=[['Date','Weather','Manpower','Equipment','Obstruction'],...p.dailyReports.map(r=>[r.report_date,r.weather,r.manpower_total,r.equipment_total,r.obstruction_reasons])];section=table(rows);}
  if(type==='weekly'){const upcoming=p.activities.filter(a=>a.status!=='completed').slice(0,8);rows=[['WBS','Activity','Status','Forecast Start','Forecast Finish','Float'],...upcoming.map(a=>[a.wbs_code,a.name,a.status,a.early_start,a.early_finish,a.total_float])];section=`<h2>Two-week Lookahead</h2>${table(rows)}<h2>Required Actions</h2><ul><li>Clear overdue design and procurement constraints.</li><li>Protect critical and near-critical work fronts.</li><li>Confirm labour, plant and materials for upcoming activities.</li></ul>`;}
  if(type==='monthly'){rows=[['WBS','Activity','Status','Actual Qty','Planned Qty','Float'],...p.activities.map(a=>[a.wbs_code,a.name,a.status,a.actual_quantity,a.planned_quantity,a.total_float])];section=`${metrics}<h2>Progress and Schedule</h2>${table(rows)}<h2>Management Narrative</h2><p>The project is ${p.evm.spi>=1?'on/ahead of':'behind'} schedule and ${p.evm.cpi>=1?'within':'above'} earned-value cost expectations. Management attention should focus on delayed work fronts, approvals and cash collection.</p>`;}
  if(type==='ipc'){rows=[['IPC','Claimed','Certified','Paid','Retention','Advance Recovery','Status'],...p.ipc.map(i=>[i.ipc_number,i.claimed_amount,i.certified_amount,i.paid_amount,i.retention_deducted,i.advance_recovered,i.status])];section=`<h2>IPC Control Sheet</h2>${table(rows)}<h2>Suggested Evidence Index</h2><ol><li>Measurement sheets and approved drawings</li><li>Daily reports and progress photographs</li><li>QA/QC acceptance records</li><li>Updated programme and quantity reconciliation</li></ol>`;}
  if(type==='claims'){rows=[['Reference','Event','Notice','Time Impact','Cost Impact','Status'],...p.claims.map(c=>[c.reference_id,c.title,c.notice_date,c.time_impact_days,c.cost_impact_amount,c.status])];section=`<h2>Variation, Notice and EOT Register</h2>${table(rows)}`;}
  if(type==='quality'){rows=[['Inspection / Test','Date','Status','NCR','Open Days','Result'],...p.qaqc.map(q=>[q.qa_item,q.inspection_date,q.status,q.ncr_number,q.ncr_open_days,q.test_result_details])];section=`<h2>QA/QC Dossier Index</h2>${table(rows)}`;}
  if(type==='safety'){rows=[['Date','Toolbox Talks','Incidents','Near Misses','Permits','Environmental Complaints'],...p.safety.map(s=>[s.log_date,s.toolbox_talks,s.incidents,s.near_misses,s.permits_issued,s.environmental_complaints])];section=`<h2>EHS Performance</h2>${table(rows)}`;}
  if(type==='handover'){rows=[['Item','Category','Status','Approved By','Approved Date'],...p.handover.map(h=>[h.item_name,h.category,h.status,h.approved_by,h.approved_date])];section=`<h2>Handover and Completion Dossier</h2>${table(rows)}`;}
  return{title:label(type),html:`${head}${section}`,rows,data:{project,type,generated_at:new Date().toISOString(),metrics:p.evm,rows,photos:storage.getSitePhotos()}};
}
function table(rows:any[][]){if(!rows.length)return'<p>No records available.</p>';return `<table><thead><tr>${rows[0].map(v=>`<th>${esc(v)}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map(row=>`<tr>${row.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`}
function esc(value:any){return String(value??'—').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')}
function label(type:ReportType){return({daily:'Daily Site Report Register',weekly:'Weekly Lookahead Plan',monthly:'Monthly Progress Report',ipc:'IPC Support File',claims:'Variation and EOT Support Report',quality:'QA/QC Dossier',safety:'Safety and EHS Report',handover:'Handover Dossier'} as Record<ReportType,string>)[type]}
