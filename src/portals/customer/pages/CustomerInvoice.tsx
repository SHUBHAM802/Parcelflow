import React, { useState, useEffect } from 'react';
import { Invoice, OrderItem } from '../../../types';
import { apiFetch } from '../../../shared/lib/api';
import { formatINR, formatDate } from '../../../shared/lib/formatters';
import { Button } from '../../../shared/components/Button';
import { ParcelFlowLogo } from '../../../shared/components/ParcelFlowLogo';
import { ArrowLeft, Printer, FileText, CheckCircle2 } from 'lucide-react';

interface CustomerInvoiceProps {
  orderId: string;
  onBack: () => void;
}

export const CustomerInvoice: React.FC<CustomerInvoiceProps> = ({ orderId, onBack }) => {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    apiFetch<{ invoice: Invoice; items: OrderItem[] }>(`/billing/invoices/order/${orderId}`)
      .then(data => {
        setInvoice(data.invoice);
        setItems(data.items || []);
      })
      .catch((err: any) => {
        setError(err.message || 'Invoice record not found');
      })
      .finally(() => setIsLoading(false));
  }, [orderId]);

  const handlePrint = () => {
    window.print();
  };

  if (!orderId) {
    return (
      <div className="max-w-md mx-auto py-20 text-center space-y-4">
        <h3 className="text-base font-bold text-stone-900">No Invoice Selected</h3>
        <p className="text-xs text-stone-500">Please select an order to review its GST tax invoice.</p>
        <Button variant="secondary" size="sm" onClick={onBack} icon={<ArrowLeft className="w-3.5 h-3.5" />}>
          Back to Orders
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="py-24 text-center text-stone-500 space-y-3">
        <div className="w-8 h-8 mx-auto border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs">Loading tax invoice details...</p>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="max-w-md mx-auto py-20 text-center space-y-4">
        <h3 className="text-base font-bold text-stone-900">Unable to Load Invoice</h3>
        <p className="text-xs text-stone-500">{error || 'Invoice not found for this order.'}</p>
        <Button variant="secondary" size="sm" onClick={onBack} icon={<ArrowLeft className="w-3.5 h-3.5" />}>
          Back to Orders
        </Button>
      </div>
    );
  }

  // Calculate CGST and SGST (9% each for intra-state Maharashtra, or IGST 18%)
  const cgst = Math.round((invoice.gst_amount / 2) * 100) / 100;
  const sgst = Math.round((invoice.gst_amount - cgst) * 100) / 100;

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-16">
      {/* Top Action Bar */}
      <div className="flex items-center justify-between gap-4 pb-2 border-b border-stone-200 print:hidden">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-semibold text-stone-600 hover:text-stone-900 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handlePrint}
            icon={<Printer className="w-4 h-4" />}
          >
            Print Tax Invoice
          </Button>
        </div>
      </div>

      {/* Invoice Sheet */}
      <div className="bg-white border border-stone-200 rounded-2xl p-8 sm:p-10 shadow-xs text-stone-800 space-y-8 print:border-none print:shadow-none print:p-0">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pb-6 border-b border-stone-200">
          <div>
            <ParcelFlowLogo variant="full" size="md" />
            <p className="text-xs text-stone-500 mt-3">Plot 42, Hinjawadi Phase 2, Pune, Maharashtra 411057</p>
            <p className="text-xs text-stone-500 font-mono mt-0.5">
              GSTIN: <strong className="text-stone-800">{invoice.gstin}</strong> <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 ml-1">Demo GSTIN</span>
            </p>
            <p className="text-xs text-stone-500">Contact: billing@parcelflow.demo &bull; Automated Logistics Hub</p>
          </div>

          <div className="sm:text-right space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded inline-block">
              Tax Invoice
            </span>
            <div className="text-sm font-mono font-bold text-stone-900 pt-1">
              Invoice No: {invoice.id}
            </div>
            <div className="text-xs text-stone-500">Date: {formatDate(invoice.issued_at)}</div>
            <div className="text-xs text-stone-500 font-mono">Order Ref: {invoice.order_id}</div>
          </div>
        </div>

        {/* Bill To / Ship To */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs pb-6 border-b border-stone-200">
          <div>
            <span className="font-semibold uppercase tracking-wider text-stone-400 block mb-1 text-[10px]">
              Customer &amp; Billed To
            </span>
            <p className="font-bold text-stone-900 text-sm">{invoice.customer_name}</p>
            <p className="text-stone-600">{invoice.customer_email}</p>
            {invoice.customer_phone && <p className="text-stone-500 font-mono">{invoice.customer_phone}</p>}
          </div>

          <div>
            <span className="font-semibold uppercase tracking-wider text-stone-400 block mb-1 text-[10px]">
              Shipping Destination
            </span>
            <p className="font-semibold text-stone-900">{invoice.line1 || 'Address on file'}</p>
            {invoice.line2 && <p className="text-stone-600">{invoice.line2}</p>}
            <p className="text-stone-700">
              {invoice.city || invoice.destination_city}, {invoice.state || 'Maharashtra'} {invoice.pincode ? `- ${invoice.pincode}` : ''}
            </p>
            <p className="text-teal-700 font-medium mt-1">Sorting Hub Destination: {invoice.destination_city}</p>
          </div>
        </div>

        {/* Items Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-stone-200 text-stone-500 uppercase tracking-wider text-[10px]">
                <th className="py-2.5 px-3">#</th>
                <th className="py-2.5 px-3">Item Description</th>
                <th className="py-2.5 px-3 text-center">HSN/SAC</th>
                <th className="py-2.5 px-3 text-center">Qty</th>
                <th className="py-2.5 px-3 text-right">Unit Price</th>
                <th className="py-2.5 px-3 text-right">Taxable Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {items.map((item, index) => {
                const taxable = item.unit_price * item.quantity;
                return (
                  <tr key={item.id} className="hover:bg-stone-50/50">
                    <td className="py-3 px-3 text-stone-400 font-mono">{index + 1}</td>
                    <td className="py-3 px-3 font-medium text-stone-900">{item.product_name}</td>
                    <td className="py-3 px-3 text-center font-mono text-stone-400">851830</td>
                    <td className="py-3 px-3 text-center font-mono font-semibold">{item.quantity}</td>
                    <td className="py-3 px-3 text-right font-mono">{formatINR(item.unit_price)}</td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-stone-900">{formatINR(taxable)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Tax Summary Breakdown */}
        <div className="flex justify-end pt-4 border-t border-stone-200">
          <div className="w-full sm:w-72 space-y-2 text-xs">
            <div className="flex justify-between text-stone-600">
              <span>Taxable Subtotal:</span>
              <span className="font-mono text-stone-900 font-medium">{formatINR(invoice.subtotal)}</span>
            </div>
            <div className="flex justify-between text-stone-600">
              <span>Central GST (CGST 9%):</span>
              <span className="font-mono text-stone-900 font-medium">{formatINR(cgst)}</span>
            </div>
            <div className="flex justify-between text-stone-600">
              <span>State GST (SGST 9%):</span>
              <span className="font-mono text-stone-900 font-medium">{formatINR(sgst)}</span>
            </div>
            <div className="flex justify-between text-stone-600">
              <span>Warehouse Handling &amp; Dispatch:</span>
              <span className="font-mono text-teal-700 font-medium">₹0.00 (Standard)</span>
            </div>
            <div className="pt-2 border-t-2 border-stone-900 flex justify-between text-sm font-bold text-stone-900">
              <span>Total Invoice Amount:</span>
              <span className="font-mono text-base text-amber-700 font-extrabold">
                {formatINR(invoice.total_amount)}
              </span>
            </div>
          </div>
        </div>

        {/* Footer Notes */}
        <div className="pt-6 border-t border-stone-200 text-[11px] text-stone-400 space-y-1">
          <p>Computer-generated invoice authenticated by ParcelFlow Automated Dispatch Engine.</p>
          <p>Payment Mode: {invoice.payment_method} &bull; Payment Status: {invoice.payment_status} (Simulated Transaction).</p>
        </div>
      </div>
    </div>
  );
};
