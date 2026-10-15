import React, { useMemo, useState } from 'react';
import { ProcurementOrder, StoreItem, Vendor, storage } from '../lib/storage';
import BsDatePicker from './BsDatePicker';
import { formatBsDate } from '../lib/nepaliDate';
import RecordDetailsDialog from './RecordDetailsDialog';

export default function ProcurementStoresDashboard({ projectId, canEdit = false }: { projectId: string; canEdit?: boolean }) {
  const [orders, setOrders] = useState<ProcurementOrder[]>(() => storage.getProcurementOrders());
  const [items, setItems] = useState<StoreItem[]>(() => storage.getStoreItems());
  const [vendors, setVendors] = useState<Vendor[]>(() => storage.getVendors());
  const [view, setView] = useState<'procurement' | 'stores' | 'vendors'>('procurement');
  const [showForm, setShowForm] = useState(false);
  const [editingPoId, setEditingPoId] = useState<string | null>(null);
  const [editingStockId, setEditingStockId] = useState<string | null>(null);
  const [editingVendorId, setEditingVendorId] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<object | null>(null);

  const [po, setPo] = useState({
    po_number: '', vendor: '', item: '', quantity: 1, unit: 'No.', unit_rate: 0,
    required_date: '', expected_date: '', order_date: '', delivery_date: '', delivered_quantity: 0, status: 'draft' as ProcurementOrder['status'], remarks: ''
  });
  const [stock, setStock] = useState({
    item_code: '', item_name: '', unit: 'No.', opening_stock: 0, received: 0,
    issued: 0, reorder_level: 0, location: 'Main Store', vendor: '', status: 'available' as StoreItem['status']
  });
  const [vendorForm, setVendorForm] = useState({
    name: '', contact_person: '', phone: '', email: '', pan_vat: '', address: '',
    category: 'Cement & Steel', status: 'active' as Vendor['status'], rating: 5, notes: ''
  });

  const stats = useMemo(() => ({
    committed: orders.filter(order => !['draft', 'cancelled'].includes(order.status)).reduce((sum, order) => sum + order.quantity * order.unit_rate, 0),
    late: orders.filter(order => order.status !== 'delivered' && order.expected_date && order.expected_date < new Date().toISOString().split('T')[0]).length,
    lowStock: items.filter(item => item.opening_stock + item.received - item.issued <= item.reorder_level).length,
    activeVendors: vendors.filter(v => v.status === 'active').length
  }), [orders, items, vendors]);

  const saveOrder = (event: React.FormEvent) => {
    event.preventDefault();
    storage.saveProcurementOrder(po);
    setOrders(storage.getProcurementOrders());
    setShowForm(false);
    setEditingPoId(null);
    setPo({ po_number: '', vendor: '', item: '', quantity: 1, unit: 'No.', unit_rate: 0, required_date: '', expected_date: '', order_date: '', delivery_date: '', delivered_quantity: 0, status: 'draft', remarks: '' });
  };

  const saveStock = (event: React.FormEvent) => {
    event.preventDefault();
    storage.saveStoreItem(stock);
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
    setItems(storage.getStoreItems());
    setShowForm(false);
    setEditingStockId(null);
    setStock({ item_code: '', item_name: '', unit: 'No.', opening_stock: 0, received: 0, issued: 0, reorder_level: 0, location: 'Main Store', vendor: '', status: 'available' });
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
    storage.deleteProcurementOrder(id);
    setOrders(storage.getProcurementOrders());
  };
  const deleteStock = (id: string) => {
    if (!confirm('Delete this store item?')) return;
    storage.deleteStoreItem(id);
    setItems(storage.getStoreItems());
  };
  const deleteVendor = (id: string) => {
    if (!confirm('Delete this vendor from the master directory?')) return;
    storage.deleteVendor(id);
    setVendors(storage.getVendors());
  };

  return (
    <div className="space-y-6 text-xs" key={projectId}>
      {/* Header bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 border border-slate-200/90 rounded-2xl shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 text-sm">📦</span>
            <h2 className="text-base font-bold text-slate-900">Procurement, Stores & Vendor Control</h2>
          </div>
          <p className="text-slate-500 text-xs mt-1">
            Purchase commitments, delivery dates, receipts, inventory issues, and verified vendor master directory.
          </p>
        </div>
        {canEdit && (
          <button 
            onClick={() => setShowForm(value => !value)} 
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-xl font-semibold text-white text-xs shadow-xs transition"
          >
            {showForm ? '✕ Cancel' : `+ ${view === 'procurement' ? 'New Purchase Order' : view === 'stores' ? 'New Store Item' : 'New Vendor'}`}
          </button>
        )}
      </div>

      {/* 4 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Committed Procurement</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 text-sm">💳</span>
          </div>
          <div className="mt-2 text-xl font-extrabold text-slate-900">NPR {(stats.committed / 1_000_000).toFixed(1)}M</div>
          <div className="mt-1 text-[11px] text-slate-500">Active purchase order commitments</div>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Late Deliveries</span>
            <span className={`flex h-8 w-8 items-center justify-center rounded-xl text-sm ${stats.late > 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
              ⏰
            </span>
          </div>
          <div className={`mt-2 text-xl font-extrabold ${stats.late > 0 ? 'text-rose-700' : 'text-slate-900'}`}>{stats.late}</div>
          <div className="mt-1 text-[11px] text-slate-500">Orders past expected date</div>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Reorder Alerts</span>
            <span className={`flex h-8 w-8 items-center justify-center rounded-xl text-sm ${stats.lowStock > 0 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
              ⚠️
            </span>
          </div>
          <div className={`mt-2 text-xl font-extrabold ${stats.lowStock > 0 ? 'text-amber-800' : 'text-slate-900'}`}>{stats.lowStock}</div>
          <div className="mt-1 text-[11px] text-slate-500">Store items at or below reorder level</div>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Vendor Directory</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-50 text-purple-600 text-sm">🤝</span>
          </div>
          <div className="mt-2 text-xl font-extrabold text-slate-900">{stats.activeVendors} Active</div>
          <div className="mt-1 text-[11px] text-slate-500">{vendors.length} total registered suppliers</div>
        </div>
      </div>

      {/* Segmented View Toggle */}
      <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/80 w-fit text-xs gap-1">
        <button 
          onClick={() => { setView('procurement'); setShowForm(false); }} 
          className={`px-4 py-2 rounded-lg font-semibold transition flex items-center gap-1.5 ${
            view === 'procurement' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <span>📋</span> Purchase Orders ({orders.length})
        </button>
        <button 
          onClick={() => { setView('stores'); setShowForm(false); }} 
          className={`px-4 py-2 rounded-lg font-semibold transition flex items-center gap-1.5 ${
            view === 'stores' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <span>🏢</span> Stores Ledger ({items.length})
        </button>
        <button 
          onClick={() => { setView('vendors'); setShowForm(false); }} 
          className={`px-4 py-2 rounded-lg font-semibold transition flex items-center gap-1.5 ${
            view === 'vendors' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <span>🤝</span> Vendor Master ({vendors.length})
        </button>
      </div>

      {canEdit && showForm && view === 'procurement' && (
        <form onSubmit={saveOrder} className="bg-white border border-blue-200 p-5 rounded-2xl space-y-4 shadow-xs">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              {editingPoId ? 'Edit Purchase Order' : 'Create Purchase Order'}
            </h3>
            <p className="text-xs text-slate-500">Record vendor commitments, promised dates, and unit rates.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Field label="PO Number"><input required value={po.po_number} onChange={e => setPo({...po, po_number: e.target.value})} placeholder="e.g. PO-2026-001" /></Field>
            <Field label="Vendor"><input required value={po.vendor} onChange={e => setPo({...po, vendor: e.target.value})} placeholder="Supplier name" /></Field>
            <Field label="Item / Package"><input required value={po.item} onChange={e => setPo({...po, item: e.target.value})} placeholder="Material name" /></Field>
            <Field label="Unit"><input value={po.unit} onChange={e => setPo({...po, unit: e.target.value})} placeholder="Bag / MT / Nos" /></Field>
            <Field label="Quantity"><input type="number" min="0" value={po.quantity} onChange={e => setPo({...po, quantity: Number(e.target.value)})} /></Field>
            <Field label="Unit Rate (NPR)"><input type="number" min="0" value={po.unit_rate} onChange={e => setPo({...po, unit_rate: Number(e.target.value)})} /></Field>
            <Field label="Order Date (BS)"><BsDatePicker value={po.order_date || ''} onChange={order_date => setPo({...po, order_date, required_date: order_date})} /></Field>
            <Field label="Delivery Date (BS)"><BsDatePicker value={po.delivery_date || ''} onChange={delivery_date => setPo({...po, delivery_date, expected_date: delivery_date})} /></Field>
            <Field label="Status">
              <select value={po.status} onChange={e => setPo({...po, status: e.target.value as ProcurementOrder['status']})}>
                {['draft', 'approved', 'ordered', 'partially_delivered', 'delivered', 'cancelled'].map(value => (
                  <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>
                ))}
              </select>
            </Field>
            <Field label="Remarks"><input value={po.remarks} onChange={e => setPo({...po, remarks: e.target.value})} placeholder="Optional remarks" /></Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50 transition">
              Cancel
            </button>
            <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-xl font-bold text-white shadow-xs transition">
              {editingPoId ? 'Update Purchase Order' : 'Save Purchase Order'}
            </button>
          </div>
        </form>
      )}

      {canEdit && showForm && view === 'stores' && (
        <form onSubmit={saveStock} className="bg-white border border-blue-200 p-5 rounded-2xl space-y-4 shadow-xs">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              {editingStockId ? 'Edit Store Item' : 'New Store Item'}
            </h3>
            <p className="text-xs text-slate-500">Record inventory materials, store location, and minimum reorder levels.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Field label="Item Code"><input required value={stock.item_code} onChange={e => setStock({...stock, item_code: e.target.value})} placeholder="e.g. MAT-CEM-01" /></Field>
            <Field label="Item Name"><input required value={stock.item_name} onChange={e => setStock({...stock, item_name: e.target.value})} placeholder="OPC Cement 53 Grade" /></Field>
            <Field label="Unit"><input value={stock.unit} onChange={e => setStock({...stock, unit: e.target.value})} placeholder="Bag / MT / Nos" /></Field>
            <Field label="Store Location"><input value={stock.location} onChange={e => setStock({...stock, location: e.target.value})} placeholder="Main Store / Shed B" /></Field>
            <Field label="Vendor / Supplier">
              <input list="vendor-list" value={stock.vendor} onChange={e => setStock({...stock, vendor: e.target.value})} placeholder="Preferred supplier" />
              <datalist id="vendor-list">
                {[...new Set(orders.map(order => order.vendor).filter(Boolean))].map(vendor => (
                  <option key={vendor} value={vendor} />
                ))}
              </datalist>
            </Field>
            <Field label="Opening Stock"><input type="number" value={stock.opening_stock || ''} onChange={e => setStock({...stock, opening_stock: Number(e.target.value)})} /></Field>
            <Field label="Received"><input type="number" value={stock.received || ''} onChange={e => setStock({...stock, received: Number(e.target.value)})} /></Field>
            <Field label="Issued"><input type="number" value={stock.issued || ''} onChange={e => setStock({...stock, issued: Number(e.target.value)})} /></Field>
            <Field label="Reorder Level"><input type="number" value={stock.reorder_level || ''} onChange={e => setStock({...stock, reorder_level: Number(e.target.value)})} /></Field>
            <Field label="Status">
              <select value={stock.status} onChange={e => setStock({...stock, status: e.target.value as StoreItem['status']})}>
                {['available', 'low_stock', 'ordered', 'inactive'].map(value => (
                  <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50 transition">
              Cancel
            </button>
            <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-xl font-bold text-white shadow-xs transition">
              {editingStockId ? 'Update Store Item' : 'Save Store Item'}
            </button>
          </div>
        </form>
      )}

      {canEdit && showForm && view === 'vendors' && (
        <form onSubmit={saveVendor} className="bg-white border border-blue-200 p-5 rounded-2xl space-y-4 shadow-xs">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              {editingVendorId ? 'Edit Vendor Master Record' : 'Register New Vendor / Supplier'}
            </h3>
            <p className="text-xs text-slate-500">Record company registration, PAN/VAT, contact details, and supplier category.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Field label="Vendor / Company Name"><input required value={vendorForm.name} onChange={e => setVendorForm({...vendorForm, name: e.target.value})} placeholder="e.g. Himalayan Cement Industries" /></Field>
            <Field label="Category / Trade">
              <select value={vendorForm.category} onChange={e => setVendorForm({...vendorForm, category: e.target.value})}>
                {['Cement & Steel', 'Aggregates & Sand', 'Heavy Equipment', 'Fuel & Lubricants', 'MEP & Electrical', 'Finishing & Tiles', 'Safety & PPE', 'Other'].map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </Field>
            <Field label="Contact Person"><input value={vendorForm.contact_person} onChange={e => setVendorForm({...vendorForm, contact_person: e.target.value})} placeholder="Representative name" /></Field>
            <Field label="Phone Number"><input value={vendorForm.phone} onChange={e => setVendorForm({...vendorForm, phone: e.target.value})} placeholder="+977-98..." /></Field>
            <Field label="Email Address"><input type="email" value={vendorForm.email} onChange={e => setVendorForm({...vendorForm, email: e.target.value})} placeholder="sales@vendor.np" /></Field>
            <Field label="PAN / VAT Number"><input value={vendorForm.pan_vat} onChange={e => setVendorForm({...vendorForm, pan_vat: e.target.value})} placeholder="9-digit PAN/VAT" /></Field>
            <Field label="Registered Address"><input value={vendorForm.address} onChange={e => setVendorForm({...vendorForm, address: e.target.value})} placeholder="City, District" /></Field>
            <Field label="Status">
              <select value={vendorForm.status} onChange={e => setVendorForm({...vendorForm, status: e.target.value as Vendor['status']})}>
                <option value="active">Active / Verified</option>
                <option value="pending_verification">Pending Verification</option>
                <option value="blacklisted">Blacklisted</option>
                <option value="inactive">Inactive</option>
              </select>
            </Field>
            <Field label="Supplier Rating (1-5)"><input type="number" min="1" max="5" value={vendorForm.rating} onChange={e => setVendorForm({...vendorForm, rating: Number(e.target.value)})} /></Field>
            <div className="md:col-span-3">
              <Field label="Commercial Notes & Terms"><input value={vendorForm.notes} onChange={e => setVendorForm({...vendorForm, notes: e.target.value})} placeholder="Payment terms, credit period, quality feedback" /></Field>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50 transition">
              Cancel
            </button>
            <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-xl font-bold text-white shadow-xs transition">
              {editingVendorId ? 'Update Vendor' : 'Save Vendor to Master'}
            </button>
          </div>
        </form>
      )}

      {/* Main Data Table */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs overflow-x-auto">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {view === 'procurement' ? 'Purchase Orders Register' : view === 'stores' ? 'Stores Stock Ledger' : 'Vendor & Supplier Master Directory'}
            </h3>
            <p className="text-xs text-slate-500">
              {view === 'procurement' ? 'Committed commitments, delivery status and supplier details.' : view === 'stores' ? 'Physical stock balances, inward receipts and issues.' : 'Verified suppliers, commercial details, PAN/VAT and procurement performance.'}
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-500">
            {view === 'procurement' ? `${orders.length} orders` : view === 'stores' ? `${items.length} items` : `${vendors.length} vendors`}
          </span>
        </div>

        {view === 'procurement' ? (
          <table className="w-full min-w-[980px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 font-semibold text-left">
                {['PO Number', 'Vendor / Item', 'Quantity', 'Value', 'Order Date (BS)', 'Delivery Date (BS)', 'Delivered', 'Status', 'Remarks', 'Action'].map(h => (
                  <th key={h} className="py-2.5 px-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {orders.map(order => (
                <tr key={order.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-2.5 px-3 font-mono font-medium text-slate-700">{order.po_number}</td>
                  <td className="py-2.5 px-3">
                    <span className="font-semibold text-slate-900">{order.vendor}</span>
                    <div className="text-[11px] text-slate-500">{order.item}</div>
                  </td>
                  <td className="py-2.5 px-3 font-medium text-slate-700">{order.quantity} {order.unit}</td>
                  <td className="py-2.5 px-3 font-mono font-medium text-slate-900">NPR {(order.quantity * order.unit_rate).toLocaleString()}</td>
                  <td className="py-2.5 px-3 font-mono text-slate-600">{formatBsDate(order.order_date || order.required_date)}</td>
                  <td className="py-2.5 px-3 font-mono text-slate-600">{formatBsDate(order.delivery_date || order.expected_date)}</td>
                  <td className="py-2.5 px-3 text-slate-700">{order.delivered_quantity}</td>
                  <td className="py-2.5 px-3"><Badge value={order.status} /></td>
                  <td className="py-2.5 px-3 text-slate-500 max-w-[150px] truncate">{order.remarks || '—'}</td>
                  <td className="py-2.5 px-3">
                    <div className="flex gap-2">
                      <button onClick={() => setSelectedRecord(order)} className="font-semibold text-slate-700 hover:text-slate-900">
                        View
                      </button>
                      {canEdit && (
                        <>
                          <button onClick={() => startEditOrder(order)} className="font-semibold text-blue-600 hover:text-blue-700">
                            Edit
                          </button>
                          <button onClick={() => deleteOrder(order.id)} className="font-semibold text-rose-600 hover:text-rose-700">
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-500">
                    No purchase orders recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full min-w-[850px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 font-semibold text-left">
                {['Item Code', 'Material', 'Vendor', 'Location', 'Opening', 'Received', 'Issued', 'Balance', 'Status', 'Action'].map(h => (
                  <th key={h} className="py-2.5 px-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {items.map(item => {
                const balance = item.opening_stock + item.received - item.issued;
                const isLow = balance <= item.reorder_level;
                return (
                  <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2.5 px-3 font-mono font-medium text-slate-700">{item.item_code}</td>
                    <td className="py-2.5 px-3">
                      <span className="font-semibold text-slate-900">{item.item_name}</span>
                      <div className="text-[11px] text-slate-500">{item.unit}</div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">{item.vendor || '—'}</td>
                    <td className="py-2.5 px-3 text-slate-600">{item.location}</td>
                    <td className="py-2.5 px-3 text-slate-600 font-mono">{item.opening_stock}</td>
                    <td className="py-2.5 px-3 text-emerald-700 font-mono font-medium">+{item.received}</td>
                    <td className="py-2.5 px-3 text-amber-700 font-mono font-medium">-{item.issued}</td>
                    <td className={`py-2.5 px-3 font-mono font-bold ${isLow ? 'text-rose-700' : 'text-slate-900'}`}>{balance}</td>
                    <td className="py-2.5 px-3">
                      <Badge value={isLow ? 'reorder' : (item.status || 'healthy')} />
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex gap-2">
                        <button onClick={() => setSelectedRecord({...item, balance})} className="font-semibold text-slate-700 hover:text-slate-900">
                          View
                        </button>
                        {canEdit && (
                          <button onClick={() => startEditStock(item)} className="font-semibold text-blue-600 hover:text-blue-700">
                            Edit
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-500">
                    No store items recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {view === 'vendors' && (
          <table className="w-full min-w-[980px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 font-semibold text-left">
                {['Vendor Name', 'Category', 'Contact Person', 'Phone / Email', 'PAN / VAT', 'Location', 'POs / Volume', 'Rating', 'Status', 'Actions'].map(h => (
                  <th key={h} className="py-2.5 px-3 text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {vendors.map(v => {
                const vendorOrders = orders.filter(o => o.vendor.toLowerCase().includes(v.name.toLowerCase()));
                const totalCommitted = vendorOrders.reduce((sum, o) => sum + (o.quantity * o.unit_rate), 0);
                return (
                  <tr key={v.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-2.5 px-3 font-bold text-slate-900">
                      <div>{v.name}</div>
                      {v.notes && <div className="text-[10px] text-slate-400 font-normal">{v.notes}</div>}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">
                      <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-semibold text-[11px]">{v.category}</span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-800 font-medium">{v.contact_person || '—'}</td>
                    <td className="py-2.5 px-3 text-slate-600">
                      <div>{v.phone || '—'}</div>
                      <div className="text-[10px] text-blue-600 truncate max-w-[140px]">{v.email || ''}</div>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-700">{v.pan_vat || '—'}</td>
                    <td className="py-2.5 px-3 text-slate-600">{v.address || '—'}</td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900">
                      <div>{vendorOrders.length} orders</div>
                      <div className="text-[10px] text-slate-500 font-normal">NPR {totalCommitted.toLocaleString()}</div>
                    </td>
                    <td className="py-2.5 px-3 text-amber-500 font-bold">
                      {'★'.repeat(v.rating || 5)}{'☆'.repeat(5 - (v.rating || 5))}
                    </td>
                    <td className="py-2.5 px-3">
                      <Badge value={v.status} />
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex gap-2">
                        <button onClick={() => setSelectedRecord({...v, totalOrders: vendorOrders.length, totalCommitted})} className="font-semibold text-slate-700 hover:text-slate-900">
                          View
                        </button>
                        {canEdit && (
                          <>
                            <button onClick={() => startEditVendor(v)} className="font-semibold text-blue-600 hover:text-blue-700">
                              Edit
                            </button>
                            <button onClick={() => deleteVendor(v.id)} className="font-semibold text-rose-600 hover:text-rose-700">
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {vendors.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-500">
                    No vendors registered yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <RecordDetailsDialog 
        title={view === 'procurement' ? 'Purchase Order Details' : view === 'stores' ? 'Store Item Details' : 'Vendor Profile Details'} 
        record={selectedRecord} 
        onClose={() => setSelectedRecord(null)} 
      />
    </div>
  );
}

function Field({label, children}: {label: string; children: React.ReactNode}) {
  return (
    <label className="text-slate-700 space-y-1 block text-xs font-semibold">
      <span>{label}</span>
      <div className="[&_input]:w-full [&_select]:w-full [&_input]:bg-white [&_select]:bg-white [&_input]:border [&_select]:border [&_input]:border-slate-300 [&_select]:border-slate-300 [&_input]:p-2 [&_select]:p-2 [&_input]:rounded-xl [&_select]:rounded-xl [&_input]:text-slate-900 [&_select]:text-slate-900 [&_input]:text-xs [&_select]:text-xs outline-none">
        {children}
      </div>
    </label>
  );
}

function Badge({value}: {value: string}) {
  let pillClass = 'status-pill-neutral';
  let label = value.replaceAll('_', ' ').toUpperCase();

  if (['delivered', 'healthy', 'approved'].includes(value)) {
    pillClass = 'status-pill-completed';
  } else if (['ordered', 'partially_delivered'].includes(value)) {
    pillClass = 'status-pill-progress';
  } else if (value === 'reorder') {
    pillClass = 'status-pill-delayed';
    label = 'REORDER';
  } else if (value === 'low_stock') {
    pillClass = 'status-pill-pending';
  }

  return (
    <span className={`status-pill ${pillClass}`}>
      <span className="status-pill-dot" />
      {label}
    </span>
  );
}
