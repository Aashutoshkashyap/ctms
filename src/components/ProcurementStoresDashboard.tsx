import React, { useEffect, useMemo, useState } from 'react';
import { InventoryEvent, ProcurementOrder, StoreItem, Vendor, storage } from '../lib/storage';
import BsDatePicker from './BsDatePicker';
import { formatBsDate } from '../lib/nepaliDate';
import RecordDetailsDialog from './RecordDetailsDialog';

function isSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export default function ProcurementStoresDashboard({ projectId, initialView, canEdit = false }: { projectId: string; initialView?: 'procurement' | 'stores' | 'vendors'; canEdit?: boolean }) {
  const [orders, setOrders] = useState<ProcurementOrder[]>(() => storage.getProcurementOrders());
  const [items, setItems] = useState<StoreItem[]>(() => storage.getStoreItems());
  const [movements, setMovements] = useState<InventoryEvent[]>(() => storage.getInventoryEvents());
  const [assignees, setAssignees] = useState<Array<{ id: string; name: string }>>([]);
  const [vendors, setVendors] = useState<Vendor[]>(() => storage.getVendors());
  const [view, setView] = useState<'procurement' | 'stores' | 'vendors'>(initialView || 'procurement');
  const [showForm, setShowForm] = useState(false);
  const [editingPoId, setEditingPoId] = useState<string | null>(null);
  const [editingStockId, setEditingStockId] = useState<string | null>(null);
  const [editingVendorId, setEditingVendorId] = useState<string | null>(null);
  const [movementItem, setMovementItem] = useState<StoreItem | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<object | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const [po, setPo] = useState({
    po_number: '', vendor: '', item: '', quantity: 1, unit: 'No.', unit_rate: 0,
    required_date: '', expected_date: '', order_date: '', delivery_date: '', delivered_quantity: 0, responsible_person_id: '', status: 'draft' as ProcurementOrder['status'], remarks: ''
  });
  const [stock, setStock] = useState({
    item_code: '', item_name: '', unit: 'No.', opening_stock: 0, received: 0,
    issued: 0, reorder_level: 0, location: 'Main Store', vendor: '', status: 'available' as StoreItem['status']
  });
  const [movement, setMovement] = useState({
    movementType: 'RECEIPT', quantity: '', occurredAt: new Date().toISOString().slice(0, 16),
    reference: '', reason: '', clientOperationId: ''
  });
  const [vendorForm, setVendorForm] = useState({
    name: '', contact_person: '', phone: '', email: '', pan_vat: '', address: '',
    category: 'Cement & Steel', status: 'active' as Vendor['status'], rating: 5, notes: ''
  });

  const stats = useMemo(() => ({
    committed: orders.filter(order => !['draft', 'cancelled'].includes(order.status)).reduce((sum, order) => sum + order.quantity * order.unit_rate, 0),
    late: orders.filter(order => order.status !== 'delivered' && order.expected_date && order.expected_date < new Date().toISOString().split('T')[0]).length,
    lowStock: items.filter(item => {
      const balance = Number.isFinite(Number(item.current_stock)) ? Number(item.current_stock) : Number(item.inventory_opening_balance ?? item.opening_stock + item.received - item.issued);
      return Number(item.reorder_level) > 0 && balance <= item.reorder_level;
    }).length,
    receipts: movements.filter(row => ['RECEIPT', 'ADJUSTMENT_IN', 'TRANSFER_IN'].includes(row.movement_type || '') || (!row.movement_type && row.event_type === 'received')).length,
    issues: movements.filter(row => ['ISSUE', 'TRANSFER_OUT'].includes(row.movement_type || '') || (!row.movement_type && row.event_type === 'issued')).length,
    awaitingApproval: orders.filter(order => order.status === 'draft').length,
    receiving: orders.filter(order => order.status === 'partially_delivered').length,
    activeVendors: vendors.filter(v => v.status === 'active').length,
  }), [orders, items, movements, vendors]);

  const headers = async () => ({ Authorization: `Bearer ${(await storage.getAuthSession())?.access_token || ''}`, 'Content-Type': 'application/json' });
  const load = async () => {
    if (!isSupabaseConfigured()) return;
    const requestHeaders = await headers();
    const [procurementResponse, inventoryResponse, assignmentResponse] = await Promise.all([
      fetch(`/api/procurement?projectId=${encodeURIComponent(projectId)}`, { headers: requestHeaders, cache: 'no-store' }),
      fetch(`/api/stores/inventory?projectId=${encodeURIComponent(projectId)}`, { headers: requestHeaders, cache: 'no-store' }),
      fetch(`/api/project-assignments?projectId=${encodeURIComponent(projectId)}`, { headers: requestHeaders, cache: 'no-store' })
    ]);
    const procurement = await procurementResponse.json().catch(() => ({})),
          inventory = await inventoryResponse.json().catch(() => ({})),
          assignmentData = await assignmentResponse.json().catch(() => ({}));
    if (procurementResponse.ok) setOrders(procurement.orders || []);
    if (inventoryResponse.ok) {
      setItems(inventory.items||[]);
      setMovements(inventory.movements||[]);
    }
    if (assignmentResponse.ok) setAssignees(assignmentData.activePeople || []);
    if (!procurementResponse.ok && !inventoryResponse.ok && procurementResponse.status !== 401) {
      setMessage(inventory.error || procurement.error || 'Cloud procurement records are unavailable.');
    }
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{void load();},[projectId]);

  const saveOrder = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (isSupabaseConfigured()) {
        const response = await fetch('/api/procurement', {
          method: editingPoId ? 'PATCH' : 'POST',
          headers: await headers(),
          body: JSON.stringify({ projectId, kind: 'order', id: editingPoId, record: po })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Purchase order could not be saved.');
        setOrders(rows => editingPoId ? rows.map(row => row.id === editingPoId ? data.record : row) : [...rows, data.record]);
      } else {
        storage.saveProcurementOrder(po);
        setOrders(storage.getProcurementOrders());
      }
      setMessage('Purchase order saved.');
      setShowForm(false);
      setEditingPoId(null);
      setPo({ po_number: '', vendor: '', item: '', quantity: 1, unit: 'No.', unit_rate: 0, required_date: '', expected_date: '', order_date: '', delivery_date: '', delivered_quantity: 0, responsible_person_id: '', status: 'draft', remarks: '' });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Purchase order could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const saveStock = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (isSupabaseConfigured()) {
        const response = await fetch('/api/procurement', {
          method: editingStockId ? 'PATCH' : 'POST',
          headers: await headers(),
          body: JSON.stringify({ projectId, kind: 'store', id: editingStockId, record: stock })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Store item could not be saved.');
        setItems(rows => editingStockId ? rows.map(row => row.id === editingStockId ? data.record : row) : [...rows, data.record]);
      } else {
        storage.saveStoreItem(stock);
        setItems(storage.getStoreItems());
      }
      setMessage('Store item saved.');
      setShowForm(false);
      setEditingStockId(null);
      setStock({ item_code: '', item_name: '', unit: 'No.', opening_stock: 0, received: 0, issued: 0, reorder_level: 0, location: 'Main Store', vendor: '', status: 'available' });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Store item could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const saveVendor = (event: React.FormEvent) => {
    event.preventDefault();
    storage.saveVendor(vendorForm);
    setVendors(storage.getVendors());
    setShowForm(false);
    setEditingVendorId(null);
    setVendorForm({ name: '', contact_person: '', phone: '', email: '', pan_vat: '', address: '', category: 'Cement & Steel', status: 'active', rating: 5, notes: '' });
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

  const startEditVendor = (v: Vendor) => {
    setEditingVendorId(v.id);
    setVendorForm({
      name: v.name, contact_person: v.contact_person || '', phone: v.phone || '',
      email: v.email || '', pan_vat: v.pan_vat || '', address: v.address || '',
      category: v.category || 'Cement & Steel', status: v.status || 'active',
      rating: v.rating || 5, notes: v.notes || ''
    });
    setView('vendors');
    setShowForm(true);
  };

  const deleteOrder = (id: string) => {
    if (!confirm('Delete this procurement record?')) return;
    const next = orders.filter(order => order.id !== id);
    localStorage.setItem('bt_procurement_orders', JSON.stringify(next));
    setOrders(storage.getProcurementOrders());
  };

  const startMovement = (item: StoreItem, movementType = 'RECEIPT') => {
    setMovementItem(item);
    setMovement({ movementType, quantity: '', occurredAt: new Date().toISOString().slice(0, 16), reference: '', reason: '', clientOperationId: crypto.randomUUID() });
    setMessage('');
  };

  const saveMovement = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!movementItem) return;
    if (!isSupabaseConfigured()) {
      setMessage('Connect the cloud database before posting stock movements. Local browser data is not used as stock authority.');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/stores/inventory', {
        method: 'POST',
        headers: await headers(),
        body:JSON.stringify({projectId,itemId:movementItem.id,...movement})
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Stock movement could not be posted.');
      setMessage('Stock movement posted and saved to the audit trail.');
      setMovementItem(null);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Stock movement could not be posted.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 text-sm text-slate-800" key={projectId}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-950">
            {view === 'stores' ? 'Inventory & stock' : view === 'vendors' ? 'Vendor & Supplier Master' : 'Purchases & orders'}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {view === 'stores' ? 'Check balances, receive or issue stock, and review every movement.' : view === 'vendors' ? 'Directory of approved suppliers, subcontractors and material vendors.' : 'Track supplier orders, delivery dates, and what still needs attention.'}
          </p>
        </div>
        <button onClick={() => setShowForm(value => !value)} className="bg-blue-700 hover:bg-blue-800 px-4 py-2.5 rounded-lg font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">
          + {view === 'procurement' ? 'New Purchase Order' : view === 'vendors' ? 'New Vendor' : 'New Store Item'}
        </button>
      </div>
      {message && <div role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-950">{message}</div>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {view === 'procurement' ? (
          <>
            <Metric label="Draft orders" value={String(stats.awaitingApproval)} />
            <Metric label="Ordered" value={String(orders.filter(order => order.status === 'ordered').length)} />
            <Metric label="Receiving" value={String(stats.receiving)} />
            <Metric label="Late deliveries" value={String(stats.late)} danger={stats.late > 0} />
          </>
        ) : view === 'vendors' ? (
          <>
            <Metric label="Active Vendors" value={String(stats.activeVendors)} />
            <Metric label="Total Vendors" value={String(vendors.length)} />
            <Metric label="Purchase Orders" value={String(orders.length)} />
            <Metric label="Committed" value={`NPR ${Math.round(stats.committed).toLocaleString()}`} />
          </>
        ) : (
          <>
            <Metric label="Stock items" value={String(items.length)} />
            <Metric label="Low stock" value={String(stats.lowStock)} danger={stats.lowStock > 0} />
            <Metric label="Receipts posted" value={String(stats.receipts)} />
            <Metric label="Issues posted" value={String(stats.issues)} />
          </>
        )}
      </div>

      {view === 'procurement' && (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
          Committed orders: <strong>NPR {Math.round(stats.committed).toLocaleString()}</strong>. {stats.late ? `${stats.late} expected deliveries need attention.` : 'No late expected deliveries.'}
        </p>
      )}

      <div className="flex gap-2 bg-slate-900/60 p-1 rounded-lg w-fit">
        <button onClick={() => { setView('procurement'); setShowForm(false); }} className={`px-4 py-2 rounded font-semibold text-xs transition ${view === 'procurement' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white'}`}>Purchase Orders</button>
        <button onClick={() => { setView('stores'); setShowForm(false); }} className={`px-4 py-2 rounded font-semibold text-xs transition ${view === 'stores' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white'}`}>Inventory & Stores</button>
        <button onClick={() => { setView('vendors'); setShowForm(false); }} className={`px-4 py-2 rounded font-semibold text-xs transition ${view === 'vendors' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white'}`}>Vendor Master</button>
      </div>

      {showForm && view === 'procurement' && (
        <form onSubmit={saveOrder} className="bg-white border border-slate-200 rounded-xl p-4 grid md:grid-cols-4 gap-3 shadow-sm">
          <Field label="PO number"><input required value={po.po_number} onChange={e => setPo({ ...po, po_number: e.target.value })} placeholder="PO-2026-001" /></Field>
          <Field label="Vendor"><input required value={po.vendor} onChange={e => setPo({ ...po, vendor: e.target.value })} placeholder="Supplier name" /></Field>
          <Field label="Item"><input required value={po.item} onChange={e => setPo({ ...po, item: e.target.value })} placeholder="Material or service" /></Field>
          <Field label="Quantity"><input required type="number" min="1" value={po.quantity} onChange={e => setPo({ ...po, quantity: Number(e.target.value) })} /></Field>
          <Field label="Unit"><input required value={po.unit} onChange={e => setPo({ ...po, unit: e.target.value })} placeholder="No., Ton, Bag" /></Field>
          <Field label="Unit rate (NPR)"><input required type="number" min="0" value={po.unit_rate} onChange={e => setPo({ ...po, unit_rate: Number(e.target.value) })} /></Field>
          <Field label="Order date"><BsDatePicker value={po.order_date || po.required_date} onChange={date => setPo({ ...po, order_date: date, required_date: date })} /></Field>
          <Field label="Expected delivery"><BsDatePicker value={po.delivery_date || po.expected_date} onChange={date => setPo({ ...po, delivery_date: date, expected_date: date })} /></Field>
          <Field label="Responsible person"><select value={po.responsible_person_id || ''} onChange={e => setPo({ ...po, responsible_person_id: e.target.value })}><option value="">Select responsible person</option>{assignees.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></Field>
          <Field label="Status"><select value={po.status} onChange={e => setPo({ ...po, status: e.target.value as any })}><option value="draft">draft</option><option value="approved">approved</option><option value="ordered">ordered</option><option value="partially_delivered">partially_delivered</option><option value="delivered">delivered</option><option value="cancelled">cancelled</option></select></Field>
          <Field label="Delivered quantity"><input type="number" min="0" value={po.delivered_quantity} onChange={e => setPo({ ...po, delivered_quantity: Number(e.target.value) })} /></Field>
          <div className="md:col-span-4 flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border rounded-lg font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
            <button disabled={saving} className="bg-blue-700 hover:bg-blue-800 text-white px-4 py-2 rounded-lg font-semibold disabled:opacity-60">{saving ? 'Saving…' : editingPoId ? 'Update Purchase Order' : 'Create Purchase Order'}</button>
          </div>
        </form>
      )}

      {showForm && view === 'stores' && (
        <form onSubmit={saveStock} className="bg-white border border-slate-200 rounded-xl p-4 grid md:grid-cols-4 gap-3 shadow-sm">
          <Field label="Item code"><input required value={stock.item_code} onChange={e => setStock({ ...stock, item_code: e.target.value })} placeholder="MAT-001" /></Field>
          <Field label="Item name"><input required value={stock.item_name} onChange={e => setStock({ ...stock, item_name: e.target.value })} placeholder="OPC Cement" /></Field>
          <Field label="Unit"><input required value={stock.unit} onChange={e => setStock({ ...stock, unit: e.target.value })} placeholder="Bag, Ton" /></Field>
          <Field label="Opening stock"><input required type="number" min="0" value={stock.opening_stock} onChange={e => setStock({ ...stock, opening_stock: Number(e.target.value) })} /></Field>
          <Field label="Reorder level"><input required type="number" min="0" value={stock.reorder_level} onChange={e => setStock({ ...stock, reorder_level: Number(e.target.value) })} /></Field>
          <Field label="Store location"><input required value={stock.location} onChange={e => setStock({ ...stock, location: e.target.value })} placeholder="Main covered store" /></Field>
          <Field label="Preferred vendor"><input value={stock.vendor} onChange={e => setStock({ ...stock, vendor: e.target.value })} placeholder="Supplier" /></Field>
          <div className="md:col-span-4 flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border rounded-lg font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
            <button disabled={saving} className="bg-blue-700 hover:bg-blue-800 text-white px-4 py-2 rounded-lg font-semibold disabled:opacity-60">{saving ? 'Saving…' : editingStockId ? 'Update Store Item' : 'Add Store Item'}</button>
          </div>
        </form>
      )}

      {showForm && view === 'vendors' && (
        <form onSubmit={saveVendor} className="bg-white border border-slate-200 rounded-xl p-4 grid md:grid-cols-4 gap-3 shadow-sm">
          <Field label="Company / Vendor Name"><input required value={vendorForm.name} onChange={e => setVendorForm({ ...vendorForm, name: e.target.value })} placeholder="Himalayan Cement Udhyog" /></Field>
          <Field label="Contact Person"><input value={vendorForm.contact_person} onChange={e => setVendorForm({ ...vendorForm, contact_person: e.target.value })} placeholder="Ram Sharma" /></Field>
          <Field label="Phone"><input value={vendorForm.phone} onChange={e => setVendorForm({ ...vendorForm, phone: e.target.value })} placeholder="9851023456" /></Field>
          <Field label="Email"><input type="email" value={vendorForm.email} onChange={e => setVendorForm({ ...vendorForm, email: e.target.value })} placeholder="sales@vendor.com" /></Field>
          <Field label="Category"><select value={vendorForm.category} onChange={e => setVendorForm({ ...vendorForm, category: e.target.value })}><option value="Cement & Steel">Cement & Steel</option><option value="Aggregates & Sand">Aggregates & Sand</option><option value="Heavy Equipment">Heavy Equipment</option><option value="Finishing & Electrical">Finishing & Electrical</option><option value="Safety & Tools">Safety & Tools</option></select></Field>
          <Field label="PAN / VAT Number"><input value={vendorForm.pan_vat} onChange={e => setVendorForm({ ...vendorForm, pan_vat: e.target.value })} placeholder="300123456" /></Field>
          <Field label="Address"><input value={vendorForm.address} onChange={e => setVendorForm({ ...vendorForm, address: e.target.value })} placeholder="Kathmandu / Biratnagar" /></Field>
          <Field label="Status"><select value={vendorForm.status} onChange={e => setVendorForm({ ...vendorForm, status: e.target.value as any })}><option value="active">Active</option><option value="inactive">Inactive</option></select></Field>
          <div className="md:col-span-4 flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border rounded-lg font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
            <button className="bg-blue-700 hover:bg-blue-800 text-white px-4 py-2 rounded-lg font-semibold">{editingVendorId ? 'Update Vendor' : 'Save Vendor'}</button>
          </div>
        </form>
      )}

      {movementItem && (
        <form onSubmit={saveMovement} className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 grid md:grid-cols-4 gap-3 shadow-sm">
          <div className="md:col-span-4">
            <b>{movementItem.item_name}</b>
            <span className="ml-2 text-slate-600">Available: {itemBalance(movementItem)} {movementItem.unit}</span>
          </div>
          <Field label="Stock action">
            <select value={movement.movementType} onChange={e => setMovement({ ...movement, movementType: e.target.value })}>
              <option value="RECEIPT">Receive stock</option>
              <option value="ISSUE">Issue stock</option>
              <option value="ADJUSTMENT_IN">Adjust stock in</option>
              <option value="ADJUSTMENT_OUT">Adjust stock out</option>
            </select>
          </Field>
          <Field label="Quantity">
            <input required type="number" min="0.001" step="0.001" value={movement.quantity} onChange={e => setMovement({ ...movement, quantity: e.target.value })} />
          </Field>
          <Field label="Date and time">
            <input required type="datetime-local" value={movement.occurredAt} onChange={e => setMovement({ ...movement, occurredAt: e.target.value })} />
          </Field>
          <Field label="Reference / destination">
            <input value={movement.reference} onChange={e => setMovement({ ...movement, reference: e.target.value })} placeholder="Delivery note, activity or team" />
          </Field>
          <Field label={movement.movementType.startsWith('ADJUSTMENT') ? 'Reason (required)' : 'Notes'}>
            <input required={movement.movementType.startsWith('ADJUSTMENT')} value={movement.reason} onChange={e => setMovement({ ...movement, reason: e.target.value })} placeholder="Why was this stock moved?" />
          </Field>
          <div className="md:col-span-4 flex gap-2 justify-end">
            <button type="button" onClick={() => setMovementItem(null)} className="rounded border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
            <button disabled={saving} className="rounded bg-emerald-600 hover:bg-emerald-700 px-4 py-2 font-semibold text-white disabled:opacity-60">{saving ? 'Posting…' : 'Post stock movement'}</button>
          </div>
        </form>
      )}

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            {view === 'stores' ? 'Current stock' : view === 'vendors' ? 'Vendor Directory' : 'Purchase orders'}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {view === 'stores' ? 'Choose an item below to receive, issue or adjust its balance.' : view === 'vendors' ? 'Approved supplier contacts, trade specialties and active fulfillment records.' : 'Open an order to see supplier, quantities, delivery and status.'}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 overflow-x-auto shadow-sm">
          {view === 'procurement' ? (
            <table className="w-full min-w-[980px]">
              <thead>
                <tr className="text-slate-600 border-b border-slate-200">
                  {['PO', 'Vendor / Item', 'Qty', 'Value', 'Order Date (BS)', 'Delivery Date (BS)', 'Delivered', 'Status', 'Remarks', 'Action'].map(h => (
                    <th key={h} className="text-left py-2 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map(order => (
                  <tr key={order.id} className="border-b border-slate-100">
                    <td className="py-3 font-mono">{order.po_number}</td>
                    <td><b>{order.vendor}</b><div className="text-slate-500">{order.item}</div></td>
                    <td>{order.quantity} {order.unit}</td>
                    <td>NPR {(order.quantity * order.unit_rate).toLocaleString()}</td>
                    <td>{formatBsDate(order.order_date || order.required_date)}</td>
                    <td>{formatBsDate(order.delivery_date || order.expected_date)}</td>
                    <td>{order.delivered_quantity}</td>
                    <td><Badge value={order.status} /></td>
                    <td>{order.remarks || '—'}</td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => setSelectedRecord({ ...order })} className="font-semibold text-blue-800">View details</button>
                        <button onClick={() => startEditOrder(order)} className="font-semibold text-blue-800">Edit</button>
                        <button onClick={() => deleteOrder(order.id)} className="font-semibold text-rose-700">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : view === 'vendors' ? (
            <table className="w-full min-w-[850px]">
              <thead>
                <tr className="text-slate-600 border-b border-slate-200">
                  {['Vendor Name', 'Contact Person', 'Phone / Email', 'Category', 'PAN / VAT', 'Status', 'Action'].map(h => (
                    <th key={h} className="text-left py-2 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vendors.map(v => (
                  <tr key={v.id} className="border-b border-slate-100">
                    <td className="py-3 font-semibold text-slate-900">{v.name}</td>
                    <td>{v.contact_person || '—'}</td>
                    <td><div>{v.phone || '—'}</div><div className="text-xs text-slate-500">{v.email || ''}</div></td>
                    <td>{v.category || 'General'}</td>
                    <td className="font-mono text-xs">{v.pan_vat || '—'}</td>
                    <td><Badge value={v.status} /></td>
                    <td>
                      <div className="flex gap-2">
                        <button onClick={() => setSelectedRecord({ ...v })} className="font-semibold text-blue-800">View details</button>
                        <button onClick={() => startEditVendor(v)} className="font-semibold text-blue-800">Edit</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full min-w-[850px]">
              <thead>
                <tr className="text-slate-600 border-b border-slate-200">
                  {['Code', 'Material', 'Vendor', 'Location', 'Opening', 'Received', 'Issued', 'Balance', 'Status', 'Action'].map(h => (
                    <th key={h} className="text-left py-2 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map(item => {
                  const balance = itemBalance(item);
                  return (
                    <tr key={item.id} className="border-b border-slate-100">
                      <td className="py-3 font-mono">{item.item_code}</td>
                      <td><b>{item.item_name}</b><div className="text-slate-500">{item.unit}</div></td>
                      <td>{item.vendor || '—'}</td>
                      <td>{item.location}</td>
                      <td>{item.inventory_opening_balance ?? item.opening_stock}</td>
                      <td className="text-emerald-700">{movementTotal(movements, item.id, ['RECEIPT', 'ADJUSTMENT_IN', 'TRANSFER_IN'])}</td>
                      <td className="text-amber-800">{movementTotal(movements, item.id, ['ISSUE', 'ADJUSTMENT_OUT', 'TRANSFER_OUT'])}</td>
                      <td className="font-bold">{balance}</td>
                      <td><Badge value={Number(item.reorder_level) > 0 && balance <= item.reorder_level ? 'reorder' : (item.status || 'healthy')} /></td>
                      <td>
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => setSelectedRecord({ ...item, balance, movements: movements.filter(row => row.item_id === item.id) })} className="font-semibold text-blue-800">View details</button>
                          <button onClick={() => startEditStock(item)} className="font-semibold text-blue-800">Edit</button>
                          <button onClick={() => startMovement(item)} className="font-semibold text-emerald-800">Receive</button>
                          <button onClick={() => startMovement(item, 'ISSUE')} className="font-semibold text-amber-800">Issue</button>
                          <button onClick={() => startMovement(item, 'ADJUSTMENT_IN')} className="font-semibold text-slate-800">Adjust</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {view === 'stores' && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 overflow-x-auto shadow-sm">
          <h3 className="mb-3 text-base font-semibold text-slate-950">Recent stock movements</h3>
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-600">
                <th>When</th><th>Item</th><th>Action</th><th>Quantity</th><th>Reference / reason</th><th>Recorded by</th>
              </tr>
            </thead>
            <tbody>
              {movements.slice(0, 12).map(row => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="py-2">{row.occurred_at || row.event_date}</td>
                  <td>{items.find(item => item.id === row.item_id)?.item_name || 'Store item'}</td>
                  <td><Badge value={(row.movement_type || row.event_type).toLowerCase()} /></td>
                  <td>{row.quantity}</td>
                  <td>{row.reference || row.reason || row.remarks || '—'}</td>
                  <td>{row.recorded_by || '—'}</td>
                </tr>
              ))}
              {!movements.length && <tr><td colSpan={6} className="py-5 text-slate-500">No posted stock movements yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <RecordDetailsDialog title="Procurement record" record={selectedRecord} onClose={() => setSelectedRecord(null)} />
    </div>
  );
}

function itemBalance(item: StoreItem) {
  return Number.isFinite(Number(item.current_stock)) ? Number(item.current_stock) : Number(item.inventory_opening_balance ?? item.opening_stock + item.received - item.issued);
}

function movementTotal(movements: InventoryEvent[], itemId: string, types: string[]) {
  return movements.filter(row => row.item_id === itemId && types.includes(row.movement_type || '')).reduce((total, row) => total + Number(row.quantity || 0), 0);
}

function Metric({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <div className="text-slate-600 text-sm font-medium">{label}</div>
      <div className={`text-2xl font-bold mt-2 tabular-nums ${danger ? 'text-rose-800' : 'text-slate-950'}`}>{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-sm font-medium text-slate-700 space-y-1">
      <span className="block">{label}</span>
      <span className="[&_input]:w-full [&_select]:w-full [&_input]:bg-white [&_select]:bg-white [&_input]:border [&_select]:border [&_input]:border-slate-300 [&_select]:border-slate-300 [&_input]:p-2 [&_select]:p-2 [&_input]:rounded-lg [&_select]:rounded-lg [&_input]:text-slate-950 [&_select]:text-slate-950">
        {children}
      </span>
    </label>
  );
}

function Badge({ value }: { value: string }) {
  const warning = ['ordered', 'partially_delivered', 'reorder'].includes(value);
  const good = ['delivered', 'healthy', 'approved', 'active'].includes(value);
  return <span className={`px-2 py-1 rounded-full text-xs font-semibold ${warning ? 'bg-amber-50 text-amber-900' : good ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>{value.replaceAll('_', ' ')}</span>;
}
