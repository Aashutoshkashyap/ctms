import React, { useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured, ProcurementOrder, StoreItem, storage } from '../lib/storage';
import BsDatePicker from './BsDatePicker';
import { formatBsDate } from '../lib/nepaliDate';
import RecordDetailsDialog from './RecordDetailsDialog';

export default function ProcurementStoresDashboard({ projectId }: { projectId: string }) {
  const [orders, setOrders] = useState<ProcurementOrder[]>(() => storage.getProcurementOrders());
  const [items, setItems] = useState<StoreItem[]>(() => storage.getStoreItems());
  const [view, setView] = useState<'procurement' | 'stores'>('procurement');
  const [showForm, setShowForm] = useState(false);
  const [editingPoId, setEditingPoId] = useState<string | null>(null);
  const [editingStockId, setEditingStockId] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<object | null>(null);
  const [saving, setSaving] = useState(false); const [message, setMessage] = useState('');

  const [po, setPo] = useState({
    po_number: '', vendor: '', item: '', quantity: 1, unit: 'No.', unit_rate: 0,
    required_date: '', expected_date: '', order_date: '', delivery_date: '', delivered_quantity: 0, status: 'draft' as ProcurementOrder['status'], remarks: ''
  });
  const [stock, setStock] = useState({
    item_code: '', item_name: '', unit: 'No.', opening_stock: 0, received: 0,
    issued: 0, reorder_level: 0, location: 'Main Store', vendor: '', status: 'available' as StoreItem['status']
  });

  const stats = useMemo(() => ({
    committed: orders.filter(order => !['draft', 'cancelled'].includes(order.status)).reduce((sum, order) => sum + order.quantity * order.unit_rate, 0),
    late: orders.filter(order => order.status !== 'delivered' && order.expected_date && order.expected_date < new Date().toISOString().split('T')[0]).length,
    lowStock: items.filter(item => item.opening_stock + item.received - item.issued <= item.reorder_level).length
  }), [orders, items]);

  const headers = async () => ({ Authorization: `Bearer ${(await storage.getAuthSession())?.access_token || ''}`, 'Content-Type': 'application/json' });
  const load = async () => { if (!isSupabaseConfigured()) return; const response=await fetch(`/api/procurement?projectId=${encodeURIComponent(projectId)}`,{headers:await headers(),cache:'no-store'}); const data=await response.json().catch(()=>({})); if(response.ok){setOrders(data.orders||[]);setItems(data.items||[]);}else if(response.status!==401)setMessage(data.error||'Cloud procurement records are unavailable.'); };
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{void load();},[projectId]);
  const saveOrder = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true); try { if(isSupabaseConfigured()){const response=await fetch('/api/procurement',{method:editingPoId?'PATCH':'POST',headers:await headers(),body:JSON.stringify({projectId,kind:'order',id:editingPoId,record:po})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Purchase order could not be saved.');setOrders(rows=>editingPoId?rows.map(row=>row.id===editingPoId?data.record:row):[...rows,data.record]);}else{storage.saveProcurementOrder(po);setOrders(storage.getProcurementOrders());} setMessage('Purchase order saved.');
    setShowForm(false);
    setEditingPoId(null);
    setPo({ po_number: '', vendor: '', item: '', quantity: 1, unit: 'No.', unit_rate: 0, required_date: '', expected_date: '', order_date: '', delivery_date: '', delivered_quantity: 0, status: 'draft', remarks: '' }); }catch(error){setMessage(error instanceof Error?error.message:'Purchase order could not be saved.');}finally{setSaving(false);}
  };

  const saveStock = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true); try { if(isSupabaseConfigured()){const response=await fetch('/api/procurement',{method:editingStockId?'PATCH':'POST',headers:await headers(),body:JSON.stringify({projectId,kind:'store',id:editingStockId,record:stock})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Store item could not be saved.');setItems(rows=>editingStockId?rows.map(row=>row.id===editingStockId?data.record:row):[...rows,data.record]);}else{storage.saveStoreItem(stock);setItems(storage.getStoreItems());} setMessage('Store item saved.');
    storage.saveInventoryEvent({
      item_id: editingStockId || stock.item_code,
      event_date: new Date().toISOString().slice(0, 10),
      event_type: 'adjusted',
      quantity: Number(stock.received || 0) - Number(stock.issued || 0),
      vendor: stock.vendor,
      location: stock.location,
      remarks: `Stock updated for ${stock.item_name}`,
      recorded_by: 'Store / Site Team'
    });
    setShowForm(false);
    setEditingStockId(null);
    setStock({ item_code: '', item_name: '', unit: 'No.', opening_stock: 0, received: 0, issued: 0, reorder_level: 0, location: 'Main Store', vendor: '', status: 'available' }); }catch(error){setMessage(error instanceof Error?error.message:'Store item could not be saved.');}finally{setSaving(false);}
  };

  const startEditOrder = (order: ProcurementOrder) => {
    setEditingPoId(order.id);
    setPo({ ...po, ...order });
    setView('procurement');
    setShowForm(true);
  };
  const startEditStock = (item: StoreItem) => {
    setEditingStockId(item.id);
    setStock({ ...stock, ...item });
    setView('stores');
    setShowForm(true);
  };
  const deleteOrder = (id: string) => {
    if (!confirm('Delete this procurement record?')) return;
    const next = orders.filter(order => order.id !== id);
    localStorage.setItem('bt_procurement_orders', JSON.stringify(next));
    setOrders(storage.getProcurementOrders());
  };

  return (
    <div className="space-y-5 text-xs" key={projectId}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Procurement & Stores Control</h2>
          <p className="text-slate-400">Purchase commitments, delivery dates, receipts, issues and reorder alerts.</p>
        </div>
        <button onClick={() => setShowForm(value => !value)} className="bg-blue-600 hover:bg-blue-500 px-3 py-2 rounded-lg font-semibold text-white">
          + {view === 'procurement' ? 'New Purchase Order' : 'New Store Item'}
        </button>
      </div>
      {message&&<div role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-950">{message}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Metric label="Committed Procurement" value={`NPR ${(stats.committed / 1_000_000).toFixed(1)}M`} />
        <Metric label="Late Deliveries" value={String(stats.late)} danger={stats.late > 0} />
        <Metric label="Reorder Alerts" value={String(stats.lowStock)} danger={stats.lowStock > 0} />
      </div>

      <div className="flex gap-2 bg-slate-900/60 p-1 rounded-lg w-fit">
        <button onClick={() => { setView('procurement'); setShowForm(false); }} className={`px-4 py-2 rounded ${view === 'procurement' ? 'bg-blue-600' : 'text-slate-400'}`}>Purchase Orders</button>
        <button onClick={() => { setView('stores'); setShowForm(false); }} className={`px-4 py-2 rounded ${view === 'stores' ? 'bg-blue-600' : 'text-slate-400'}`}>Stores Ledger</button>
      </div>

      {showForm && view === 'procurement' && (
        <form onSubmit={saveOrder} className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-800/60 border border-slate-700 p-4 rounded-xl">
          <Field label="PO Number"><input required value={po.po_number} onChange={e => setPo({...po, po_number:e.target.value})} /></Field>
          <Field label="Vendor"><input required value={po.vendor} onChange={e => setPo({...po, vendor:e.target.value})} /></Field>
          <Field label="Item / Package"><input required value={po.item} onChange={e => setPo({...po, item:e.target.value})} /></Field>
          <Field label="Unit"><input value={po.unit} onChange={e => setPo({...po, unit:e.target.value})} /></Field>
          <Field label="Quantity"><input type="number" value={po.quantity} onChange={e => setPo({...po, quantity:Number(e.target.value)})} /></Field>
          <Field label="Unit Rate"><input type="number" value={po.unit_rate} onChange={e => setPo({...po, unit_rate:Number(e.target.value)})} /></Field>
          <Field label="Order Date (BS)"><BsDatePicker value={po.order_date || ''} onChange={order_date => setPo({...po, order_date, required_date:order_date})} /></Field>
          <Field label="Delivery Date (BS)"><BsDatePicker value={po.delivery_date || ''} onChange={delivery_date => setPo({...po, delivery_date, expected_date:delivery_date})} /></Field>
          <Field label="Status"><select value={po.status} onChange={e => setPo({...po, status:e.target.value as ProcurementOrder['status']})}>{['draft','approved','ordered','partially_delivered','delivered','cancelled'].map(value => <option key={value}>{value}</option>)}</select></Field>
          <Field label="Remarks"><input value={po.remarks} onChange={e => setPo({...po, remarks:e.target.value})} /></Field>
          <button disabled={saving} className="self-end bg-emerald-600 hover:bg-emerald-500 p-2 rounded font-semibold text-white disabled:opacity-60">{saving?'Saving…':editingPoId ? 'Update Purchase Order' : 'Save Purchase Order'}</button>
        </form>
      )}

      {showForm && view === 'stores' && (
        <form onSubmit={saveStock} className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-800/60 border border-slate-700 p-4 rounded-xl">
          <Field label="Item Code"><input required value={stock.item_code} onChange={e => setStock({...stock, item_code:e.target.value})} /></Field>
          <Field label="Item Name"><input required value={stock.item_name} onChange={e => setStock({...stock, item_name:e.target.value})} /></Field>
          <Field label="Unit"><input value={stock.unit} onChange={e => setStock({...stock, unit:e.target.value})} /></Field>
          <Field label="Location"><input value={stock.location} onChange={e => setStock({...stock, location:e.target.value})} /></Field>
          <Field label="Vendor / Supplier"><input list="vendor-list" value={stock.vendor} onChange={e => setStock({...stock, vendor:e.target.value})} /><datalist id="vendor-list">{[...new Set(orders.map(order=>order.vendor).filter(Boolean))].map(vendor=><option key={vendor} value={vendor}/>)}</datalist></Field>
          <Field label="Opening"><input type="number" value={stock.opening_stock || ''} onChange={e => setStock({...stock, opening_stock:Number(e.target.value)})} /></Field>
          <Field label="Received"><input type="number" value={stock.received || ''} onChange={e => setStock({...stock, received:Number(e.target.value)})} /></Field>
          <Field label="Issued"><input type="number" value={stock.issued || ''} onChange={e => setStock({...stock, issued:Number(e.target.value)})} /></Field>
          <Field label="Reorder Level"><input type="number" value={stock.reorder_level || ''} onChange={e => setStock({...stock, reorder_level:Number(e.target.value)})} /></Field>
          <Field label="Status"><select value={stock.status} onChange={e => setStock({...stock,status:e.target.value as StoreItem['status']})}>{['available','low_stock','ordered','inactive'].map(value=><option key={value}>{value}</option>)}</select></Field>
          <button disabled={saving} className="self-end bg-emerald-600 hover:bg-emerald-500 p-2 rounded font-semibold text-white disabled:opacity-60">{saving?'Saving…':editingStockId ? 'Update Store Item' : 'Save Store Item'}</button>
        </form>
      )}

      <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-4 overflow-x-auto">
        {view === 'procurement' ? (
          <table className="w-full min-w-[980px]"><thead><tr className="text-slate-400 border-b border-slate-700">{['PO','Vendor / Item','Qty','Value','Order Date (BS)','Delivery Date (BS)','Delivered','Status','Remarks','Action'].map(h => <th key={h} className="text-left py-2">{h}</th>)}</tr></thead>
            <tbody>{orders.map(order => <tr key={order.id} className="border-b border-slate-800"><td className="py-3 font-mono">{order.po_number}</td><td><b>{order.vendor}</b><div className="text-slate-500">{order.item}</div></td><td>{order.quantity} {order.unit}</td><td>NPR {(order.quantity * order.unit_rate).toLocaleString()}</td><td>{formatBsDate(order.order_date || order.required_date)}</td><td>{formatBsDate(order.delivery_date || order.expected_date)}</td><td>{order.delivered_quantity}</td><td><Badge value={order.status} /></td><td>{order.remarks || '—'}</td><td><div className="flex gap-2"><button onClick={()=>setSelectedRecord({...order})} className="font-bold text-slate-100">View details</button><button onClick={()=>startEditOrder(order)} className="font-bold text-blue-700">Edit details</button><button onClick={()=>deleteOrder(order.id)} className="font-bold text-rose-700">Delete</button></div></td></tr>)}</tbody>
          </table>
        ) : (
          <table className="w-full min-w-[850px]"><thead><tr className="text-slate-400 border-b border-slate-700">{['Code','Material','Vendor','Location','Opening','Received','Issued','Balance','Status','Action'].map(h => <th key={h} className="text-left py-2">{h}</th>)}</tr></thead>
            <tbody>{items.map(item => { const balance=item.opening_stock+item.received-item.issued; return <tr key={item.id} className="border-b border-slate-800"><td className="py-3 font-mono">{item.item_code}</td><td><b>{item.item_name}</b><div className="text-slate-500">{item.unit}</div></td><td>{item.vendor || '—'}</td><td>{item.location}</td><td>{item.opening_stock}</td><td className="text-emerald-400">+{item.received}</td><td className="text-amber-400">-{item.issued}</td><td className="font-bold">{balance}</td><td><Badge value={balance <= item.reorder_level ? 'reorder' : (item.status || 'healthy')} /></td><td><button onClick={()=>startEditStock(item)} className="font-bold text-blue-700">Edit</button></td></tr> })}</tbody>
          </table>
        )}
      </div>
      <RecordDetailsDialog title="Procurement record" record={selectedRecord} onClose={()=>setSelectedRecord(null)} />
    </div>
  );
}

function Metric({label,value,danger=false}:{label:string;value:string;danger?:boolean}) {
  return <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-4"><div className="text-slate-500 uppercase text-[10px] font-bold">{label}</div><div className={`text-xl font-bold mt-1 ${danger?'text-rose-400':'text-slate-100'}`}>{value}</div></div>;
}
function Field({label,children}:{label:string;children:React.ReactNode}) {
  return <label className="text-slate-400 space-y-1"><span className="block">{label}</span><span className="[&_input]:w-full [&_select]:w-full [&_input]:bg-slate-950 [&_select]:bg-slate-950 [&_input]:border [&_select]:border [&_input]:border-slate-700 [&_select]:border-slate-700 [&_input]:p-2 [&_select]:p-2 [&_input]:rounded [&_select]:rounded [&_input]:text-slate-200 [&_select]:text-slate-200">{children}</span></label>;
}
function Badge({value}:{value:string}) {
  const warning=['ordered','partially_delivered','reorder'].includes(value);
  const good=['delivered','healthy','approved'].includes(value);
  return <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${warning?'bg-amber-500/10 text-amber-400':good?'bg-emerald-500/10 text-emerald-400':'bg-slate-700 text-slate-300'}`}>{value.replaceAll('_',' ')}</span>;
}
