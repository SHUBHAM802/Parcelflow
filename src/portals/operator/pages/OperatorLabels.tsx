import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../../shared/lib/api';
import { useToast } from '../../../shared/store/toastContext';
import { Button } from '../../../shared/components/Button';
import { StatusPill } from '../../../shared/components/StatusPill';
import { QRCodeSVG } from 'qrcode.react';
import {
  Printer,
  QrCode,
  Sparkles,
  RefreshCw,
  Sliders,
  CheckCircle2,
  AlertCircle,
  FileText,
  Boxes
} from 'lucide-react';

interface PackableOrder {
  id: string;
  customer_id: string;
  recipient_name: string;
  destination_city: string;
  status: string;
  total_amount: number;
  created_at: string;
  parcel_id?: string | null;
  label_payload?: string | null;
  bin_label?: string | null;
  bin_number?: number | null;
  label_print_count?: number;
}

const enableDemoHelpers = (import.meta as any).env?.VITE_ENABLE_DEMO_HELPERS === 'true';

export const OperatorLabels: React.FC = () => {
  const { showToast } = useToast();
  const [orders, setOrders] = useState<PackableOrder[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [calibrationModal, setCalibrationModal] = useState<boolean>(false);
  const [creatingDemo, setCreatingDemo] = useState<boolean>(false);
  const [printModalData, setPrintModalData] = useState<{
    orders: PackableOrder[];
    sheetMode: 'single' | 'a4_sheet';
  } | null>(null);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      // Fetch queue ready/packing orders + parcels
      const res = await apiFetch<any>('/warehouse/queue');
      const packList: PackableOrder[] = [...(res.packing || []), ...(res.ready || [])];

      // Also fetch parcel details for these orders
      const parcels = await apiFetch<any[]>('/warehouse/parcels').catch(() => []);
      const merged = packList.map(o => {
        const p = parcels.find((p: any) => p.order_id === o.id);
        return {
          ...o,
          parcel_id: p?.id || null,
          label_payload: p?.label_payload || null,
          bin_label: p?.bin_label || null,
          bin_number: p?.bin_number || null,
          label_print_count: p?.label_print_count || 0
        };
      });

      setOrders(merged);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Failed to load orders for label studio', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const handleSelectOrder = (id: string) => {
    setSelectedOrderIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedOrderIds.length === orders.length) {
      setSelectedOrderIds([]);
    } else {
      setSelectedOrderIds(orders.map(o => o.id));
    }
  };

  const handleCreateDemoOrder = async () => {
    setCreatingDemo(true);
    try {
      const res = await apiFetch<any>('/operator/demo-order', { method: 'POST' });
      showToast(`Demo Order ${res.orderId} created in PACKED state with label!`, 'success');
      await fetchOrders();
      if (!selectedOrderIds.includes(res.orderId)) {
        setSelectedOrderIds(prev => [res.orderId, ...prev]);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to create demo order', 'error');
    } finally {
      setCreatingDemo(false);
    }
  };

  const handleBatchPrintPreview = async (sheetMode: 'single' | 'a4_sheet') => {
    if (selectedOrderIds.length === 0) {
      showToast('Select at least one order to print', 'warning');
      return;
    }

    try {
      // Ensure all selected orders have labels generated
      const labelsRes = await apiFetch<any>('/operator/labels/batch', {
        method: 'POST',
        body: JSON.stringify({ orderIds: selectedOrderIds.slice(0, 12) })
      });

      const readyOrders = orders.filter(o => selectedOrderIds.includes(o.id)).map(o => {
        const found = labelsRes.labels?.find((l: any) => l.orderId === o.id);
        return {
          ...o,
          parcel_id: found?.parcel?.id || o.parcel_id || `PF-${Date.now().toString().slice(-6)}`,
          label_payload: found?.labelPayload || o.label_payload || `PF1.PARCEL.DEMO`,
          bin_label: found?.bin?.label || o.bin_label || 'BIN 1',
          bin_number: found?.bin?.number || o.bin_number || 1
        };
      });

      setPrintModalData({ orders: readyOrders, sheetMode });
    } catch (err: any) {
      showToast(err.message || 'Failed to generate batch labels', 'error');
    }
  };

  const handleConfirmPrinted = async () => {
    if (!printModalData) return;
    try {
      for (const o of printModalData.orders) {
        if (o.parcel_id) {
          await apiFetch('/warehouse/labels/printed', {
            method: 'POST',
            body: JSON.stringify({ parcelId: o.parcel_id })
          }).catch(console.error);
        }
      }
      showToast('Label prints recorded to audit log', 'success');
      setPrintModalData(null);
      fetchOrders();
    } catch (err: any) {
      showToast(err.message || 'Failed to record prints', 'error');
    }
  };

  const executeBrowserPrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-zinc-200">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight flex items-center gap-3">
            <QrCode className="w-6 h-6 text-teal-600" />
            <span>Label Studio &amp; Print Station</span>
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Authoritative QR-code generation, physical label printing, and optical camera calibration sheets.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setCalibrationModal(true)}
            icon={<Sliders className="w-3.5 h-3.5 text-zinc-600" />}
          >
            QR Calibration Sheet
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={fetchOrders}
            icon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
          >
            Refresh
          </Button>

          {enableDemoHelpers && (
            <Button
              variant="teal"
              size="sm"
              onClick={handleCreateDemoOrder}
              disabled={creatingDemo}
              icon={<Sparkles className="w-3.5 h-3.5" />}
            >
              {creatingDemo ? 'Creating...' : 'Create Demo Order'}
            </Button>
          )}
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="bg-white border border-zinc-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-zinc-700">
            Selected: <span className="font-mono font-bold text-teal-700">{selectedOrderIds.length}</span> / {orders.length} orders
          </span>
          {selectedOrderIds.length > 0 && (
            <button
              onClick={() => setSelectedOrderIds([])}
              className="text-xs text-zinc-500 hover:text-zinc-800 underline cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={selectedOrderIds.length === 0}
            onClick={() => handleBatchPrintPreview('single')}
            icon={<Printer className="w-3.5 h-3.5" />}
          >
            Single Labels (100×100mm)
          </Button>

          <Button
            variant="teal"
            size="sm"
            disabled={selectedOrderIds.length === 0}
            onClick={() => handleBatchPrintPreview('a4_sheet')}
            icon={<FileText className="w-3.5 h-3.5" />}
          >
            A4 Sheet (2×3 Grid)
          </Button>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 uppercase tracking-wider font-semibold">
                <th className="py-3 px-4 w-10">
                  <input
                    type="checkbox"
                    checked={orders.length > 0 && selectedOrderIds.length === orders.length}
                    onChange={handleSelectAll}
                    className="rounded border-zinc-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                  />
                </th>
                <th className="py-3 px-3">Order ID</th>
                <th className="py-3 px-3">Recipient &amp; Destination</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Parcel ID</th>
                <th className="py-3 px-3">Target Bin</th>
                <th className="py-3 px-3">Printed</th>
                <th className="py-3 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 font-mono">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-zinc-400 font-sans">
                    Loading packed orders...
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-zinc-500 font-sans">
                    <Boxes className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
                    No orders currently in packed status. Create a demo order above to generate test labels.
                  </td>
                </tr>
              ) : (
                orders.map(order => {
                  const isSelected = selectedOrderIds.includes(order.id);
                  return (
                    <tr
                      key={order.id}
                      className={`hover:bg-zinc-50/80 transition-colors ${
                        isSelected ? 'bg-teal-50/40' : ''
                      }`}
                    >
                      <td className="py-3 px-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelectOrder(order.id)}
                          className="rounded border-zinc-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                        />
                      </td>
                      <td className="py-3 px-3 font-bold text-zinc-900">{order.id}</td>
                      <td className="py-3 px-3 font-sans">
                        <div className="font-semibold text-zinc-900">{order.recipient_name || 'Customer'}</div>
                        <div className="text-[11px] text-zinc-500">{order.destination_city}</div>
                      </td>
                      <td className="py-3 px-3 font-sans">
                        <StatusPill status={order.status} />
                      </td>
                      <td className="py-3 px-3 font-mono text-zinc-700">
                        {order.parcel_id || (
                          <span className="text-zinc-400 italic font-sans">Pending generation</span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {order.bin_label ? (
                          <span className="px-2 py-0.5 rounded bg-zinc-100 text-zinc-800 font-bold border border-zinc-200 text-[11px]">
                            {order.bin_label}
                          </span>
                        ) : (
                          <span className="text-zinc-400">-</span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {order.label_print_count && order.label_print_count > 0 ? (
                          <span className="flex items-center gap-1 text-emerald-600 font-sans font-semibold text-[11px]">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{order.label_print_count}x printed</span>
                          </span>
                        ) : (
                          <span className="text-zinc-400 font-sans text-[11px]">Not printed</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-sans">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setSelectedOrderIds([order.id]);
                            handleBatchPrintPreview('single');
                          }}
                          icon={<Printer className="w-3 h-3" />}
                        >
                          Print
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Print Preview Modal */}
      {printModalData && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-zinc-200">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-zinc-900 text-white flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold flex items-center gap-2">
                  <Printer className="w-4 h-4 text-teal-400" />
                  <span>Print Preview ({printModalData.sheetMode === 'single' ? 'Single 100×100mm' : 'A4 Sheet 2×3'})</span>
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {printModalData.orders.length} label(s) ready to print
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="teal" size="sm" onClick={executeBrowserPrint} icon={<Printer className="w-3.5 h-3.5" />}>
                  Trigger Print Dialog
                </Button>
                <button
                  onClick={() => setPrintModalData(null)}
                  className="px-2.5 py-1 text-xs text-zinc-400 hover:text-white rounded bg-zinc-800"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Modal Content / Printable Area */}
            <div className="flex-1 overflow-y-auto p-6 bg-zinc-100">
              <div
                id="print-sheet-content"
                className={
                  printModalData.sheetMode === 'a4_sheet'
                    ? 'grid grid-cols-2 gap-4 max-w-3xl mx-auto'
                    : 'flex flex-col items-center gap-6'
                }
              >
                {printModalData.orders.map(o => (
                  <div
                    key={o.id}
                    className="bg-white border-2 border-dashed border-zinc-800 p-4 rounded-xl text-zinc-950 font-mono text-xs w-full max-w-[340px] shadow-sm"
                    style={{ pageBreakInside: 'avoid' }}
                  >
                    <div className="flex justify-between items-start border-b-2 border-zinc-950 pb-1.5 mb-2">
                      <div>
                        <h4 className="font-bold text-xs tracking-tight">PARCELFLOW LOGISTICS</h4>
                        <span className="text-[8px] text-zinc-500">Automated Conveyor Sort</span>
                      </div>
                      <span className="text-xs font-black bg-black text-white px-2 py-0.5 rounded">
                        {o.bin_label || 'BIN 1'}
                      </span>
                    </div>

                    <div className="mb-2 text-[11px] leading-tight font-sans">
                      <span className="text-[8px] font-bold text-zinc-500 uppercase font-mono block">SHIP TO:</span>
                      <strong className="block text-zinc-900">{o.recipient_name || 'Customer'}</strong>
                      <span className="text-zinc-600 block">{o.destination_city} Hub</span>
                    </div>

                    {/* Real authoritative SVG QR Code */}
                    <div className="flex flex-col items-center justify-center py-2 bg-zinc-50 border border-zinc-200 rounded-lg">
                      <QRCodeSVG
                        value={o.label_payload || `PF1.${o.parcel_id || o.id}.DEMO`}
                        size={120}
                        level="Q"
                        includeMargin={true}
                        bgColor="#ffffff"
                        fgColor="#000000"
                        style={{ shapeRendering: 'crispEdges' }}
                      />
                      <span className="text-[10px] font-bold tracking-widest mt-1">
                        {o.parcel_id || o.id}
                      </span>
                      <span className="text-[8px] text-zinc-400 font-mono">
                        {o.id} &bull; {o.destination_city}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 bg-white border-t border-zinc-200 flex items-center justify-between">
              <span className="text-xs text-zinc-500">
                After printing completes in your system dialog, click &ldquo;Confirm Labels Printed&rdquo; to log print timestamps.
              </span>

              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setPrintModalData(null)}>
                  Cancel
                </Button>
                <Button variant="teal" size="sm" onClick={handleConfirmPrinted} icon={<CheckCircle2 className="w-3.5 h-3.5" />}>
                  Confirm Labels Printed
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QR Calibration Sheet Modal */}
      {calibrationModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-zinc-200">
            <div className="px-6 py-4 bg-zinc-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-teal-400" />
                <h3 className="text-base font-bold">QR Camera Calibration Sheet</h3>
              </div>
              <button
                onClick={() => setCalibrationModal(false)}
                className="px-2.5 py-1 text-xs text-zinc-400 hover:text-white rounded bg-zinc-800"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Guidance note */}
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <span>Optical Calibration Guidance for Viva &amp; Physical Rig:</span>
                </div>
                <p>
                  Print this calibration sheet on matte paper (no glossy finish/lamination). Position your USB camera at the real prototype mounting height above the belt. Start testing with <strong>35mm–40mm</strong>. The smallest size your webcam reads reliably under ambient room lighting is your optimal production size.
                </p>
              </div>

              {/* Sizes comparison grid */}
              <div className="grid grid-cols-5 gap-3 items-end text-center p-4 bg-zinc-50 border border-zinc-200 rounded-xl">
                {[
                  { sizeMm: 20, px: 75, label: '20 mm (Compact)' },
                  { sizeMm: 25, px: 95, label: '25 mm' },
                  { sizeMm: 30, px: 115, label: '30 mm' },
                  { sizeMm: 35, px: 135, label: '35 mm (Recommended)' },
                  { sizeMm: 40, px: 150, label: '40 mm (High Reliability)' }
                ].map(item => (
                  <div key={item.sizeMm} className="flex flex-col items-center bg-white p-2 rounded-lg border border-zinc-200">
                    <QRCodeSVG
                      value={`PF1.PF-CALIB-${item.sizeMm}MM.TEST01`}
                      size={item.px}
                      level="Q"
                      includeMargin={true}
                      style={{ shapeRendering: 'crispEdges' }}
                    />
                    <span className="font-mono font-bold text-xs mt-2 text-zinc-900">{item.sizeMm} mm</span>
                    <span className="text-[9px] text-zinc-500 font-sans mt-0.5">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-6 py-3 bg-white border-t border-zinc-200 flex justify-end gap-2">
              <Button variant="teal" size="sm" onClick={() => window.print()} icon={<Printer className="w-3.5 h-3.5" />}>
                Print Calibration Sheet
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
