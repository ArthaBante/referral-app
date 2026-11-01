import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, X, Check, Keyboard, AlertCircle } from 'lucide-react';

interface QrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (scannedValue: string) => void;
  title?: string;
  placeholder?: string;
}

export const QrScannerModal: React.FC<QrScannerModalProps> = ({
  isOpen,
  onClose,
  onScan,
  title = 'Scan Customer QR',
  placeholder = 'Paste or type customer personal token...',
}) => {
  const [manualCode, setManualCode] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [useManual, setUseManual] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const safeStopScanner = (scanner: Html5Qrcode | null) => {
    if (!scanner) return;
    try {
      let isScanning = false;
      try {
        if (typeof scanner.getState === 'function') {
          isScanning = scanner.getState() === 2; // Html5QrcodeScannerState.SCANNING is 2
        } else {
          isScanning = (scanner as any).isScanning === true;
        }
      } catch (_) {
        isScanning = false;
      }

      if (isScanning) {
        try {
          scanner.stop().catch(() => {});
        } catch (_) {}
      }
    } catch (_) {
      // Ignore stop errors
    } finally {
      try {
        scanner.clear();
      } catch (_) {}
      scannerRef.current = null;
    }
  };

  useEffect(() => {
    if (!isOpen || useManual) return;

    let isMounted = true;
    const elementId = 'html5qr-code-full-region';

    const startScanner = async () => {
      try {
        setCameraError(null);
        const scanner = new Html5Qrcode(elementId);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decodedText) => {
            if (isMounted) {
              safeStopScanner(scannerRef.current);
              onScan(decodedText);
              onClose();
            }
          },
          () => {}
        );
      } catch (err: any) {
        if (isMounted) {
          console.warn('Camera start error, switching to manual input:', err);
          setCameraError(err.message || 'Camera not accessible in this browser/device.');
          safeStopScanner(scannerRef.current);
          setUseManual(true);
        }
      }
    };

    // Small delay for DOM node rendering
    const timer = setTimeout(startScanner, 100);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      safeStopScanner(scannerRef.current);
    };
  }, [isOpen, useManual]);

  if (!isOpen) return null;

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      onScan(manualCode.trim());
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-sm w-full overflow-hidden shadow-2xl border border-neutral-200">
        <div className="p-4 bg-rose-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-amber-300" />
            <h3 className="font-bold text-sm text-white">{title}</h3>
          </div>
          <button
            onClick={() => {
              safeStopScanner(scannerRef.current);
              onClose();
            }}
            className="p-1 rounded-lg text-rose-300 hover:text-white hover:bg-rose-900 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {!useManual && (
            <div>
              <div
                id="html5qr-code-full-region"
                className="w-full aspect-square bg-black rounded-2xl overflow-hidden border border-neutral-300"
              />
              <p className="text-center text-[11px] text-neutral-500 mt-2">
                Point camera at customer's personal pass QR code
              </p>
            </div>
          )}

          {cameraError && !useManual && (
            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{cameraError}</span>
            </div>
          )}

          {/* Manual Input Toggle / Form */}
          <div className="pt-1">
            {!useManual ? (
              <button
                type="button"
                onClick={() => {
                  safeStopScanner(scannerRef.current);
                  setUseManual(true);
                }}
                className="w-full py-2 px-3 rounded-xl border border-neutral-300 hover:bg-neutral-50 text-xs font-bold text-neutral-700 flex items-center justify-center gap-1.5 transition"
              >
                <Keyboard className="w-4 h-4" />
                <span>Type Token Code Instead</span>
              </button>
            ) : (
              <form onSubmit={handleManualSubmit} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-neutral-600 uppercase mb-1">
                    Enter / Paste Customer Token
                  </label>
                  <input
                    type="text"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    placeholder={placeholder}
                    required
                    className="w-full p-2.5 rounded-xl border border-neutral-300 text-xs font-mono font-medium outline-none focus:border-rose-600"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-rose-900 hover:bg-rose-800 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>Verify Token</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setUseManual(false)}
                    className="px-3 py-2.5 border border-neutral-300 text-neutral-600 rounded-xl text-xs font-bold hover:bg-neutral-50"
                  >
                    Camera
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
