import React, { useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Printer, Download } from 'lucide-react';
import { Button } from '../../../shared/components/Button';

interface ShippingLabelProps {
  orderId: string;
  parcelId: string;
  labelPayload: string;
  recipientName: string;
  addressLine1: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  weight: number;
  dimensions: string;
  binLabel: string;
  binNumber: number;
  categoryName: string;
  paymentMethod: string;
  onPrint?: () => void;
}

export const ShippingLabel: React.FC<ShippingLabelProps> = ({
  orderId,
  parcelId,
  labelPayload,
  recipientName,
  addressLine1,
  city,
  state,
  pincode,
  phone,
  weight,
  dimensions,
  binLabel,
  binNumber,
  categoryName,
  paymentMethod,
  onPrint
}) => {
  const labelRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    if (onPrint) onPrint();

    // Use a print-specific window
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (!printWindow || !labelRef.current) {
      window.print();
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Label - ${parcelId}</title>
          <style>
            body { margin: 0; padding: 8mm; font-family: 'Courier New', monospace; }
            @media print { @page { size: 100mm 150mm; margin: 4mm; } }
          </style>
        </head>
        <body>${labelRef.current.innerHTML}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 300);
  };

  return (
    <div className="space-y-3">
      {/* Printable label area */}
      <div
        ref={labelRef}
        id={`label-${parcelId}`}
        className="border-2 border-dashed border-zinc-800 p-5 rounded-xl bg-white text-zinc-950 space-y-3 font-mono text-xs"
        style={{ maxWidth: '380px' }}
      >
        {/* Header */}
        <div className="flex justify-between items-start border-b-2 border-zinc-950 pb-2">
          <div>
            <h3 className="font-bold text-sm tracking-tight">PARCELFLOW LOGISTICS</h3>
            <p className="text-[9px] text-zinc-600">Automated Fulfillment Center</p>
          </div>
          <div className="text-right">
            <span className="text-sm font-black bg-black text-white px-2 py-0.5 rounded">
              {binLabel}
            </span>
            <p className="text-[9px] text-zinc-500 mt-0.5">{categoryName}</p>
          </div>
        </div>

        {/* Ship-to */}
        <div className="space-y-0.5 text-xs">
          <span className="text-[9px] uppercase font-bold text-zinc-500">SHIP TO:</span>
          <p className="font-bold text-sm">{recipientName}</p>
          <p>{addressLine1}</p>
          <p>{city}, {state} - {pincode}</p>
          <p>PH: {phone}</p>
        </div>

        {/* Metrics row */}
        <div className="grid grid-cols-4 gap-1 border-y border-zinc-950 py-1.5 text-center text-[9px]">
          <div>
            <span className="text-zinc-500 block">WEIGHT</span>
            <span className="font-bold">{weight}g</span>
          </div>
          <div>
            <span className="text-zinc-500 block">BIN</span>
            <span className="font-bold text-teal-800">{binLabel}</span>
          </div>
          <div>
            <span className="text-zinc-500 block">PAYMENT</span>
            <span className="font-bold">{paymentMethod}</span>
          </div>
          <div>
            <span className="text-zinc-500 block">SIZE</span>
            <span className="font-bold">{dimensions}</span>
          </div>
        </div>

        {/* QR Code — the real scannable label */}
        <div className="flex flex-col items-center justify-center pt-1 space-y-1">
          <QRCodeSVG
            value={labelPayload}
            size={160}
            level="M"
            includeMargin={false}
            bgColor="#ffffff"
            fgColor="#000000"
          />
          <div className="text-center">
            <span className="text-[10px] font-bold tracking-widest block">{parcelId}</span>
            <span className="text-[8px] text-zinc-400 block">{orderId}</span>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <Button
          variant="teal"
          size="sm"
          onClick={handlePrint}
          icon={<Printer className="w-3.5 h-3.5" />}
        >
          Print Label
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            // Download SVG as image
            const svg = labelRef.current?.querySelector('svg');
            if (svg) {
              const svgData = new XMLSerializer().serializeToString(svg);
              const blob = new Blob([svgData], { type: 'image/svg+xml' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `label-${parcelId}.svg`;
              a.click();
              URL.revokeObjectURL(url);
            }
          }}
          icon={<Download className="w-3.5 h-3.5" />}
        >
          Download QR
        </Button>
      </div>
    </div>
  );
};
