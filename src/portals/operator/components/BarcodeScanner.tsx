import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserQRCodeReader } from '@zxing/browser';
import { apiFetch } from '../../../shared/lib/api';
import { useToast } from '../../../shared/store/toastContext';
import {
  Camera, CameraOff, CheckCircle2, XCircle, AlertTriangle, Loader2,
  Scan, RefreshCw, ZapOff, Wifi, WifiOff
} from 'lucide-react';
import { Button } from '../../../shared/components/Button';

interface ScanResult {
  result: string;
  parcelId?: string;
  orderId?: string;
  bin?: { number: number; label: string; category: string };
  state?: string;
  message: string;
}

interface BarcodeCannerProps {
  onScanResult?: (result: ScanResult) => void;
  autoStart?: boolean;
}

export const BarcodeScanner: React.FC<BarcodeCannerProps> = ({
  onScanResult,
  autoStart = false
}) => {
  const { showToast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserQRCodeReader | null>(null);
  const controlsRef = useRef<any>(null);

  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [lastPayload, setLastPayload] = useState('');
  const [scanCount, setScanCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState('');

  // Manual entry
  const [manualPayload, setManualPayload] = useState('');

  // Initialize reader
  useEffect(() => {
    readerRef.current = new BrowserQRCodeReader();

    // Enumerate cameras
    BrowserQRCodeReader.listVideoInputDevices().then(devs => {
      setDevices(devs);
      if (devs.length > 0) {
        // Prefer rear camera
        const rear = devs.find(d =>
          d.label.toLowerCase().includes('back') ||
          d.label.toLowerCase().includes('rear') ||
          d.label.toLowerCase().includes('environment')
        );
        setSelectedDevice(rear?.deviceId || devs[0].deviceId);
      }
    }).catch(err => {
      console.warn('[Scanner] Failed to list cameras:', err);
      setError('No cameras found. Use manual entry below.');
    });

    return () => {
      stopScanning();
    };
  }, []);

  useEffect(() => {
    if (autoStart && selectedDevice && !isActive) {
      startScanning();
    }
  }, [selectedDevice, autoStart]);

  const stopScanning = useCallback(() => {
    if (controlsRef.current) {
      controlsRef.current.stop();
      controlsRef.current = null;
    }
    setIsActive(false);
  }, []);

  const startScanning = useCallback(async () => {
    if (!readerRef.current || !videoRef.current) return;
    setIsLoading(true);
    setError(null);

    try {
      const controls = await readerRef.current.decodeFromVideoDevice(
        selectedDevice || undefined,
        videoRef.current,
        (result, err) => {
          if (result) {
            const payload = result.getText();
            // Deduplicate rapid-fire reads of the same code
            if (payload && payload !== lastPayload) {
              setLastPayload(payload);
              handleScan(payload);
            }
          }
          // err is expected when no code is visible — ignore
        }
      );

      controlsRef.current = controls;
      setIsActive(true);
    } catch (err: any) {
      console.error('[Scanner] Start failed:', err);
      if (err.name === 'NotAllowedError') {
        setError('Camera permission denied. Please allow camera access in browser settings.');
      } else if (err.name === 'NotFoundError') {
        setError('No camera found. Connect a webcam or use manual entry.');
      } else {
        setError(`Camera error: ${err.message}`);
      }
    } finally {
      setIsLoading(false);
    }
  }, [selectedDevice, lastPayload]);

  const handleScan = async (payload: string) => {
    const startMs = performance.now();

    try {
      const res = await apiFetch<ScanResult>('/warehouse/scan', {
        method: 'POST',
        body: JSON.stringify({
          payload,
          source: 'browser_camera',
          decodeMs: Math.round(performance.now() - startMs)
        })
      });

      setLastResult(res);
      setScanCount(c => c + 1);

      if (res.result === 'ACCEPTED') {
        showToast(`✓ Parcel ${res.parcelId} accepted → ${res.bin?.label || 'BIN'}`, 'success');
      } else if (res.result === 'DUPLICATE') {
        showToast(`Already scanned: ${res.parcelId}`, 'info');
      } else {
        showToast(`Scan ${res.result}: ${res.message}`, 'error');
      }

      if (onScanResult) onScanResult(res);
    } catch (err: any) {
      showToast(`Scan API error: ${err.message}`, 'error');
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualPayload.trim()) return;
    handleScan(manualPayload.trim());
    setManualPayload('');
  };

  const resultIcon = lastResult ? {
    ACCEPTED: <CheckCircle2 className="w-5 h-5 text-emerald-500" />,
    DUPLICATE: <AlertTriangle className="w-5 h-5 text-amber-500" />,
    INVALID_FORMAT: <XCircle className="w-5 h-5 text-red-500" />,
    BAD_CHECKSUM: <XCircle className="w-5 h-5 text-red-500" />,
    UNKNOWN_PARCEL: <XCircle className="w-5 h-5 text-red-500" />,
    WRONG_STATE: <AlertTriangle className="w-5 h-5 text-amber-500" />,
    BUSY: <ZapOff className="w-5 h-5 text-orange-500" />,
    REJECTED: <XCircle className="w-5 h-5 text-red-500" />,
  }[lastResult.result] || null : null;

  return (
    <div className="space-y-4">
      {/* Camera viewport */}
      <div className="relative bg-zinc-950 rounded-xl overflow-hidden border border-zinc-800" style={{ minHeight: 280 }}>
        <video
          ref={videoRef}
          className={`w-full h-auto ${isActive ? '' : 'hidden'}`}
          style={{ maxHeight: 360 }}
          muted
          playsInline
        />

        {!isActive && !isLoading && (
          <div className="flex flex-col items-center justify-center py-16 text-zinc-500 space-y-3">
            <CameraOff className="w-10 h-10 stroke-1" />
            <p className="text-xs">Camera not active</p>
            <Button
              variant="teal"
              size="sm"
              onClick={startScanning}
              icon={<Camera className="w-3.5 h-3.5" />}
            >
              Start Camera
            </Button>
          </div>
        )}

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/80">
            <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
          </div>
        )}

        {/* Scan overlay crosshair */}
        {isActive && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-8 border-2 border-teal-500/40 rounded-lg">
              <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-teal-400 rounded-tl" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-teal-400 rounded-tr" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-teal-400 rounded-bl" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-teal-400 rounded-br" />
            </div>
            {/* Scanning animation line */}
            <div className="absolute left-10 right-10 h-0.5 bg-teal-400/60 animate-pulse" style={{ top: '50%' }} />
          </div>
        )}

        {/* Status bar */}
        {isActive && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-zinc-950/90 to-transparent px-3 py-2">
            <div className="flex items-center justify-between text-[10px]">
              <div className="flex items-center gap-1.5 text-teal-400">
                <Scan className="w-3 h-3 animate-pulse" />
                <span>Scanning...</span>
              </div>
              <span className="text-zinc-500">{scanCount} scans</span>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        {isActive ? (
          <Button variant="secondary" size="sm" onClick={stopScanning} icon={<CameraOff className="w-3.5 h-3.5" />}>
            Stop Camera
          </Button>
        ) : (
          <Button variant="teal" size="sm" onClick={startScanning} disabled={isLoading} icon={<Camera className="w-3.5 h-3.5" />}>
            {isLoading ? 'Starting...' : 'Start Camera'}
          </Button>
        )}

        {devices.length > 1 && (
          <select
            value={selectedDevice}
            onChange={e => { setSelectedDevice(e.target.value); if (isActive) { stopScanning(); setTimeout(startScanning, 200); } }}
            className="text-xs h-8 px-2 bg-white border border-zinc-300 rounded-lg text-zinc-900"
          >
            {devices.map(d => (
              <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0, 8)}`}</option>
            ))}
          </select>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-800 flex items-start gap-2">
          <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Last scan result */}
      {lastResult && (
        <div className={`p-3 rounded-xl border text-xs ${
          lastResult.result === 'ACCEPTED'
            ? 'bg-emerald-50 border-emerald-200'
            : lastResult.result === 'DUPLICATE'
            ? 'bg-amber-50 border-amber-200'
            : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-center gap-2 mb-1">
            {resultIcon}
            <span className="font-bold">{lastResult.result}</span>
            {lastResult.parcelId && <span className="font-mono text-zinc-600">({lastResult.parcelId})</span>}
          </div>
          <p className="text-zinc-700">{lastResult.message}</p>
          {lastResult.bin && (
            <p className="font-mono text-teal-800 mt-1">
              → Route to {lastResult.bin.label} ({lastResult.bin.category})
            </p>
          )}
        </div>
      )}

      {/* Manual entry fallback */}
      <form onSubmit={handleManualSubmit} className="flex gap-2">
        <input
          type="text"
          value={manualPayload}
          onChange={e => setManualPayload(e.target.value)}
          placeholder="Manual: paste QR payload (PF1.PF-YYMMDD-NNNN.mac10)"
          className="flex-1 h-8 px-3 text-xs bg-white border border-zinc-300 rounded-lg font-mono text-zinc-900 placeholder:text-zinc-400"
        />
        <Button type="submit" variant="secondary" size="sm" icon={<Scan className="w-3 h-3" />}>
          Submit
        </Button>
      </form>
    </div>
  );
};
