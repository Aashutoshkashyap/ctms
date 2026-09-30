import React, { useEffect, useMemo, useState } from 'react';
import { InventoryEvent, isSupabaseConfigured, ProcurementOrder, StoreItem, storage } from '../lib/storage';
import BsDatePicker from './BsDatePicker';
import { formatBsDate } from '../lib/nepaliDate';
import RecordDetailsDialog from './RecordDetailsDialog';

export default function ProcurementStoresDashboard({ projectId, initialView }: { projectId: string; initialView?: 'procurement' | 'stores' }) {
  const [orders, setOrders] = useState<ProcurementOrder[]>(() => storage.getProcurementOrders());
  const [items, setItems] = useState<StoreItem[]>(() => storage.getStoreItems());
  const [movements, setMovements] = useState<InventoryEvent[]>([]);
  const [assignees, setAssignees] = useState<Array<{ auth_user_id: string; name: string }>>([]);
  const [view, setView] = useState<'procurement' | 'stores'>(initialView || 'procurement');
  const [showForm, setShowForm] = useState(false);
  const [editingPoId, setEditingPoId] = useState<string | null>(null);
  const [editingStockId, setEditingStockId] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<object | null>(null);
  const [movementItem, setMovementItem] = useState<StoreItem | null>(null);
  const [movement, setMovement] = useState({ movementType: 'RECEIPT', quantity: '', occurredAt: new Date().toISOString().slice(0, 16), reference: '', reason: '', clientOperationId: crypto.randomUUID() });
  const [saving, setSaving] = useState(false); const [message, setMessage] = useState('');

  const [po, setPo] = useState({
    po_number: '', vendor: '', item: '', quantity: 1, unit: 'No.', unit_rate: 0,
    required_date: '', expected_date: '', order_date: '', delivery_date: '', delivered_quantity: 0, responsible_person_id: '', status: 'draft' as ProcurementOrder['status'], remarks: ''
  });
  const [stock, setStock] = useState({
    item_code: '', item_name: '', unit: 'No.', opening_stock: 0, received: 0,
    issued: 0, reorder_level: 0, location: 'Main Store', vendor: '', status: 'available' as StoreItem['status']
  });

  const stats = useMemo(() => ({
    committed: orders.filter(order => !['draft', 'cancelled'].includes(order.status)).reduce((sum, order) => sum + order.quantity * order.unit_rate, 0),
    late: orders.filter(order => order.status !== 'delivered' && order.expected_date && order.expected_date < new Date().toISOString().split('T')[0]).length,
    lowStock: items.filter(item => Number(item.reorder_level) > 0 && itemBalance(item) <= item.reorder_level).length,
    receipts: movements.filter(row => ['RECEIPT', 'TRANSFER_IN'].includes(row.movement_type || '') || (!row.movement_type && row.event_type === 'received')).length,
    issues: movements.filter(row => ['ISSUE', 'TRANSFER_OUT'].includes(row.movement_type || '') || (!row.movement_type && row.event_type === 'issued')).length,
    awaitingApproval: orders.filter(order => order.status === 'draft').length,
    receiving: orders.filter(order => order.status === 'partially_delivered').length,
  }), [orders, items, movements]);

  const headers = async () => ({ Authorization: `Bearer ${(await storage.getAuthSession())?.access_token || ''}`, 'Content-Type': 'application/json' });
  const load = async () => { if (!isSupabaseConfigured()) return; const requestHeaders=await headers(); const [procurementResponse,inventoryResponse,assignmentResponse]=await Promise.all([fetch(`/api/procurement?projectId=${encodeURIComponent(projectId)}`,{headers:requestHeaders,cache:'no-store'}),fetch(`/api/stores/inventory?projectId=${encodeURIComponent(projectId)}`,{headers:requestHeaders,cache:'no-store'}),fetch(`/api/project-assignments?projectId=${encodeURIComponent(projectId)}`,{headers:requestHeaders,cache:'no-store'})]); const procurement=await procurementResponse.json().catch(()=>({})),inventory=await inventoryResponse.json().catch(()=>({})),assignmentData=await assignmentResponse.json().catch(()=>({})); if(procurementResponse.ok)setOrders(procurement.orders||[]); if(inventoryResponse.ok){setItems(inventory.items||[]);setMovements(inventory.movements||[]);} if(assignmentResponse.ok)setAssignees(assignmentData.activePeople||[]); if(!procurementResponse.ok&&!inventoryResponse.ok&&procurementResponse.status!==401)setMessage(inventory.error||procurement.error||'Cloud procurement records are unavailable.'); };
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{void load();},[projectId]);
  const saveOrder = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true); try { if(isSupabaseConfigured()){const response=await fetch('/api/procurement',{method:editingPoId?'PATCH':'POST',headers:await headers(),body:JSON.stringify({projectId,kind:'order',id:editingPoId,record:po})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Purchase order could not be saved.');setOrders(rows=>editingPoId?rows.map(row=>row.id===editingPoId?data.record:row):[...rows,data.record]);}else{storage.saveProcurementOrder(po);setOrders(storage.getProcurementOrders());} setMessage('Purchase order saved.');
    setShowForm(false);
    setEditingPoId(null);
    setPo({ po_number: '', vendor: '', item: '', quantity: 1, unit: 'No.', unit_rate: 0, required_date: '', expected_date: '', order_date: '', delivery_date: '', delivered_quantity: 0, responsible_person_id: '', status: 'draft', remarks: '' }); }catch(error){setMessage(error instanceof Error?error.message:'Purchase order could not be saved.');}finally{setSaving(false);}
  };

  const saveStock = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true); try { if(isSupabaseConfigured()){const response=await fetch('/api/procurement',{method:editingStockId?'PATCH':'POST',headers:await headers(),body:JSON.stringify({projectId,kind:'store',id:editingStockId,record:stock})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Store item could not be saved.');setItems(rows=>editingStockId?rows.map(row=>row.id===editingStockId?data.record:row):[...rows,data.record]);}else{storage.saveStoreItem(stock);setItems(storage.getStoreItems());} setMessage('Store item saved.');
    setShowForm(false);
    setEditingStockId(null);
    setStock({ item_code: '', item_name: '', unit: 'No.', opening_stock: 0, received: 0, issued: 0, reorder_level: 0, location: 'Main Store', vendor: '', status: 'available' }); }catch(error){setMessage(error instanceof Error?error.message:'Store item could not be saved.');}finally{setSaving(false);}
  };

  const startEditOrder = (order: ProcurementOrder) => {
    setEditingPoId(order.id);
    setPo({ ...po, ...order, responsible_person_id: order.responsible_person_id || '' });
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
  const startMovement = (item: StoreItem, movementType = 'RECEIPT') => { setMovementItem(item); setMovement({ movementType, quantity: '', occurredAt: new Date().toISOString().slice(0, 16), reference: '', reason: '', clientOperationId: crypto.randomUUID() }); setMessage(''); };
  const saveMovement = async (event: React.FormEvent) => { event.preventDefault(); if(!movementItem)return; if(!isSupabaseConfigured()){setMessage('Connect the cloud database before posting stock movements. Local browser data is not used as stock authority.');return;} setSaving(true); try { const response=await fetch('/api/stores/inventory',{method:'POST',headers:await headers(),body:JSON.stringify({projectId,itemId:movementItem.id,...movement})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Stock movement could not be posted.');setMessage('Stock movement posted and saved to the audit trail.');setMovementItem(null);await load();}catch(error){setMessage(error instanceof Error?error.message:'Stock movement could not be posted.');}finally{setSaving(false);} };

  return (
    <div className="space-y-6 text-sm text-slate-800" key={projectId}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-950">{view === 'stores' ? 'Inventory & stock' : 'Purchases & orders'}</h1>
          <p className="mt-1 text-sm text-slate-600">{view === 'stores' ? 'Check balances, receive or issue stock, and review every movement.' : 'Track supplier orders, delivery dates, and what still needs attention.'}</p>
        </div>
        <button onClick={() => setShowForm(value => !value)} className="bg-blue-700 hover:bg-blue-800 px-4 py-2.5 rounded-lg font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">
          + {view === 'procurement' ? 'New Purchase Order' : 'New Store Item'}
        </button>
      </div>
      {message&&<div role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-950">{message}</div>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {view === 'procurement' ? <><Metric label="Draft orders" value={String(stats.awaitingApproval)} /><Metric label="Ordered" value={String(orders.filter(order => order.status === 'ordered').length)} /><Metric label="Receiving" value={String(stats.receiving)} /><Metric label="Late deliveries" value={String(stats.late)} danger={stats.late > 0} /></> : <><Metric label="Stock items" value={String(items.length)} /><Metric label="Low stock" value={String(stats.lowStock)} danger={stats.lowStock > 0} /><Metric label="Receipts posted" value={String(stats.receipts)} /><Metric label="Issues posted" value={String(stats.issues)} /></>}
      </div>
      {view === 'procurement' && <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">Committed orders: <strong>NPR {Math.round(stats.committed).toLocaleString()}</strong>. {stats.late ? `${stats.late} expected deliveries need attention.` : 'No late expected deliveries.'}</p>}

      {!initialView && <div className="flex gap-2 bg-slate-900/60 p-1 rounded-lg w-fit">
        <button onClick={() => { setView('procurement'); setShowForm(false); }} className={`px-4 py-2 rounded ${view === 'procurement' ? 'bg-blue-600' : 'text-slate-400'}`}>Purchase Orders</button>
        <button onClick={() => { setView('stores'); setShowForm(false); }} className={`px-4 py-2 rounded ${view === 'stores' ? 'bg-blue-600' : 'text-slate-400'}`}>Stores Ledger</button>
      </div>}

      {showForm && view === 'procurement' && (
        <form onSubmit={saveOrder} className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-white border border-slate-200 p-5 rounded-xl shadow-sm">
          <Field label="PO Number"><input required value={po.po_number} onChange={e => setPo({...po, po_number:e.target.value})} /></Field>
          <Field label="Vendor"><input required value={po.vendor} onChange={e => setPo({...po, vendor:e.target.value})} /></Field>
          <Field label="Item / Package"><input required value={po.item} onChange={e => setPo({...po, item:e.target.value})} /></Field>
          <Field label="Unit"><input value={po.unit} onChange={e => setPo({...po, unit:e.target.value})} /></Field>
          <Field label="Quantity"><input type="number" value={po.quantity} onChange={e => setPo({...po, quantity:Number(e.target.value)})} /></Field>
          <Field label="Unit Rate"><input type="number" value={po.unit_rate} onChange={e => setPo({...po, unit_rate:Number(e.target.value)})} /></Field>
          <Field label="Order Date (BS)"><BsDatePicker value={po.order_date || ''} onChange={order_date => setPo({...po, order_date, required_date:order_date})} /></Field>
          <Field label="Delivery Date (BS)"><BsDatePicker value={po.delivery_date || ''} onChange={delivery_date => setPo({...po, delivery_date, expected_date:delivery_date})} /></Field>
          {assignees.length > 0 && <Field label="Responsible person"><select value={po.responsible_person_id || ''} onChange={e => setPo({...po, responsible_person_id:e.target.value})}><option value="">Not assigned</option>{assignees.map(person => <option key={person.auth_user_id} value={person.auth_user_id}>{person.name}</option>)}</select></Field>}
          <Field label="Status"><select value={po.status} onChange={e => setPo({...po, status:e.target.value as ProcurementOrder['status']})}>{['draft','approved','ordered','partially_delivered','delivered','cancelled'].map(value => <option key={value}>{value}</option>)}</select></Field>
          <Field label="Remarks"><input value={po.remarks} onChange={e => setPo({...po, remarks:e.target.value})} /></Field>
          <button disabled={saving} className="self-end bg-emerald-600 hover:bg-emerald-500 p-2 rounded font-semibold text-white disabled:opacity-60">{saving?'Saving…':editingPoId ? 'Update Purchase Order' : 'Save Purchase Order'}</button>
        </form>
      )}

      {showForm && view === 'stores' && (
        <form onSubmit={saveStock} className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-white border border-slate-200 p-5 rounded-xl shadow-sm">
          <Field label="Item Code"><input required value={stock.item_code} onChange={e => setStock({...stock, item_code:e.target.value})} /></Field>
          <Field label="Item Name"><input required value={stock.item_name} onChange={e => setStock({...stock, item_name:e.target.value})} /></Field>
          <Field label="Unit"><input value={stock.unit} onChange={e => setStock({...stock, unit:e.target.value})} /></Field>
          <Field label="Location"><input value={stock.location} onChange={e => setStock({...stock, location:e.target.value})} /></Field>
          <Field label="Vendor / Supplier"><input list="vendor-list" value={stock.vendor} onChange={e => setStock({...stock, vendor:e.target.value})} /><datalist id="vendor-list">{[...new Set(orders.map(order=>order.vendor).filter(Boolean))].map(vendor=><option key={vendor} value={vendor}/>)}</datalist></Field>
          {!editingStockId&&<Field label="Opening Stock"><input type="number" min="0" step="0.001" value={stock.opening_stock || ''} onChange={e => setStock({...stock, opening_stock:Number(e.target.value)})} /></Field>}
          <Field label="Reorder Level"><input type="number" value={stock.reorder_level || ''} onChange={e => setStock({...stock, reorder_level:Number(e.target.value)})} /></Field>
          <Field label="Status"><select value={stock.status} onChange={e => setStock({...stock,status:e.target.value as StoreItem['status']})}>{['available','low_stock','ordered','inactive'].map(value=><option key={value}>{value}</option>)}</select></Field>
          <button disabled={saving} className="self-end bg-emerald-600 hover:bg-emerald-500 p-2 rounded font-semibold text-white disabled:opacity-60">{saving?'Saving…':editingStockId ? 'Update Store Item' : 'Save Store Item'}</button>
        </form>
      )}

      {movementItem && (
        <form onSubmit={saveMovement} className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-blue-50 border border-blue-200 p-4 rounded-xl text-slate-900">
          <div className="md:col-span-4"><b>{movementItem.item_name}</b><span className="ml-2 text-slate-600">Available: {itemBalance(movementItem)} {movementItem.unit}</span></div>
          <Field label="Stock action"><select value={movement.movementType} onChange={e=>setMovement({...movement,movementType:e.target.value})}><option value="RECEIPT">Receive stock</option><option value="ISSUE">Issue stock</option><option value="ADJUSTMENT_IN">Adjust stock in</option><option value="ADJUSTMENT_OUT">Adjust stock out</option></select></Field>
          <Field label="Quantity"><input required type="number" min="0.001" step="0.001" value={movement.quantity} onChange={e=>setMovement({...movement,quantity:e.target.value})}/></Field>
          <Field label="Date and time"><input required type="datetime-local" value={movement.occurredAt} onChange={e=>setMovement({...movement,occurredAt:e.target.value})}/></Field>
          <Field label="Reference / destination"><input value={movement.reference} onChange={e=>setMovement({...movement,reference:e.target.value})} placeholder="Delivery note, activity or team"/></Field>
          <Field label={movement.movementType.startsWith('ADJUSTMENT')?'Reason (required)':'Notes'}><input required={movement.movementType.startsWith('ADJUSTMENT')} value={movement.reason} onChange={e=>setMovement({...movement,reason:e.target.value})} placeholder="Why was this stock moved?"/></Field>
          <button type="button" onClick={()=>setMovementItem(null)} className="self-end rounded border border-slate-300 bg-white p-2 font-semibold text-slate-700">Cancel</button>
          <button disabled={saving} className="self-end rounded bg-emerald-600 p-2 font-semibold text-white disabled:opacity-60">{saving?'Posting…':'Post stock movement'}</button>
        </form>
      )}

      <section className="space-y-3"><div><h2 className="text-lg font-semibold text-slate-950">{view === 'stores' ? 'Current stock' : 'Purchase orders'}</h2><p className="mt-1 text-sm text-slate-600">{view === 'stores' ? 'Choose an item below to receive, issue or adjust its balance.' : 'Open an order to see supplier, quantities, delivery and status.'}</p></div><div className="bg-white border border-slate-200 rounded-xl p-4 overflow-x-auto shadow-sm">
        {view === 'procurement' ? (
          <table className="w-full min-w-[980px]"><thead><tr className="text-slate-600 border-b border-slate-200">{['PO','Vendor / Item','Qty','Value','Order Date (BS)','Delivery Date (BS)','Delivered','Status','Remarks','Action'].map(h => <th key={h} className="text-left py-2 font-semibold">{h}</th>)}</tr></thead>
            <tbody>{orders.map(order => <tr key={order.id} className="border-b border-slate-100"><td className="py-3 font-mono">{order.po_number}</td><td><b>{order.vendor}</b><div className="text-slate-500">{order.item}</div></td><td>{order.quantity} {order.unit}</td><td>NPR {(order.quantity * order.unit_rate).toLocaleString()}</td><td>{formatBsDate(order.order_date || order.required_date)}</td><td>{formatBsDate(order.delivery_date || order.expected_date)}</td><td>{order.delivered_quantity}</td><td><Badge value={order.status} /></td><td>{order.remarks || '—'}</td><td><div className="flex flex-wrap gap-2"><button onClick={()=>setSelectedRecord({...order})} className="font-semibold text-blue-800">View details</button><button onClick={()=>startEditOrder(order)} className="font-semibold text-blue-800">Edit</button><button onClick={()=>deleteOrder(order.id)} className="font-semibold text-rose-700">Delete</button></div></td></tr>)}</tbody>
          </table>
        ) : (
          <table className="w-full min-w-[850px]"><thead><tr className="text-slate-600 border-b border-slate-200">{['Code','Material','Vendor','Location','Opening','Received','Issued','Balance','Status','Action'].map(h => <th key={h} className="text-left py-2 font-semibold">{h}</th>)}</tr></thead>
            <tbody>{items.map(item => { const balance=itemBalance(item); return <tr key={item.id} className="border-b border-slate-100"><td className="py-3 font-mono">{item.item_code}</td><td><b>{item.item_name}</b><div className="text-slate-500">{item.unit}</div></td><td>{item.vendor || '—'}</td><td>{item.location}</td><td>{item.inventory_opening_balance ?? item.opening_stock}</td><td className="text-emerald-700">{movementTotal(movements,item.id,['RECEIPT','ADJUSTMENT_IN','TRANSFER_IN'])}</td><td className="text-amber-800">{movementTotal(movements,item.id,['ISSUE','ADJUSTMENT_OUT','TRANSFER_OUT'])}</td><td className="font-bold">{balance}</td><td><Badge value={Number(item.reorder_level) > 0 && balance <= item.reorder_level ? 'reorder' : (item.status || 'healthy')} /></td><td><div className="flex flex-wrap gap-2"><button onClick={()=>setSelectedRecord({...item, balance, movements:movements.filter(row=>row.item_id===item.id)})} className="font-semibold text-blue-800">View details</button><button onClick={()=>startEditStock(item)} className="font-semibold text-blue-800">Edit</button><button onClick={()=>startMovement(item)} className="font-semibold text-emerald-800">Receive</button><button onClick={()=>startMovement(item,'ISSUE')} className="font-semibold text-amber-800">Issue</button><button onClick={()=>startMovement(item,'ADJUSTMENT_IN')} className="font-semibold text-slate-800">Adjust</button></div></td></tr> })}</tbody>
          </table>
        )}
      </div></section>
      {view==='stores'&&<div className="rounded-xl border border-slate-200 bg-white p-4 overflow-x-auto shadow-sm"><h3 className="mb-3 text-base font-semibold text-slate-950">Recent stock movements</h3><table className="w-full min-w-[760px]"><thead><tr className="border-b border-slate-200 text-left text-slate-600"><th>When</th><th>Item</th><th>Action</th><th>Quantity</th><th>Reference / reason</th><th>Recorded by</th></tr></thead><tbody>{movements.slice(0,12).map(row=><tr key={row.id} className="border-b border-slate-100"><td className="py-2">{row.occurred_at||row.event_date}</td><td>{items.find(item=>item.id===row.item_id)?.item_name||'Store item'}</td><td><Badge value={(row.movement_type||row.event_type).toLowerCase()} /></td><td>{row.quantity}</td><td>{row.reference||row.reason||row.remarks||'—'}</td><td>{row.recorded_by||'—'}</td></tr>)}{!movements.length&&<tr><td colSpan={6} className="py-5 text-slate-500">No posted stock movements yet.</td></tr>}</tbody></table></div>}
      <RecordDetailsDialog title="Procurement record" record={selectedRecord} onClose={()=>setSelectedRecord(null)} />
    </div>
  );
}

function itemBalance(item: StoreItem) { return Number.isFinite(Number(item.current_stock)) ? Number(item.current_stock) : Number(item.inventory_opening_balance ?? item.opening_stock + item.received - item.issued); }
function movementTotal(movements: InventoryEvent[], itemId: string, types: string[]) { return movements.filter(row=>row.item_id===itemId&&types.includes(row.movement_type||'')).reduce((total,row)=>total+Number(row.quantity||0),0); }

function Metric({label,value,danger=false}:{label:string;value:string;danger?:boolean}) {
  return <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm"><div className="text-slate-600 text-sm font-medium">{label}</div><div className={`text-2xl font-bold mt-2 tabular-nums ${danger?'text-rose-800':'text-slate-950'}`}>{value}</div></div>;
}
function Field({label,children}:{label:string;children:React.ReactNode}) {
  return <label className="text-sm font-medium text-slate-700 space-y-1"><span className="block">{label}</span><span className="[&_input]:w-full [&_select]:w-full [&_input]:bg-white [&_select]:bg-white [&_input]:border [&_select]:border [&_input]:border-slate-300 [&_select]:border-slate-300 [&_input]:p-2 [&_select]:p-2 [&_input]:rounded-lg [&_select]:rounded-lg [&_input]:text-slate-950 [&_select]:text-slate-950">{children}</span></label>;
}
function Badge({value}:{value:string}) {
  const warning=['ordered','partially_delivered','reorder'].includes(value);
  const good=['delivered','healthy','approved'].includes(value);
  return <span className={`px-2 py-1 rounded-full text-xs font-semibold ${warning?'bg-amber-50 text-amber-900':good?'bg-emerald-50 text-emerald-800':'bg-slate-100 text-slate-700'}`}>{value.replaceAll('_',' ')}</span>;
}
