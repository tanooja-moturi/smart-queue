'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Camera, ShieldAlert } from 'lucide-react';

interface QrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (decodedText: string) => void;
}

export const QrScannerModal: React.FC<QrScannerModalProps> = ({ isOpen, onClose, onScanSuccess }) => {
  const [error, setError] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const qrCodeRef = useRef<Html5Qrcode | null>(null);
  const containerId = 'qr-reader-container';

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;

    const startScanner = async () => {
      try {
        setError(null);
        // Give modal animation / render a tiny bit of time
        await new Promise((resolve) => setTimeout(resolve, 300));
        
        if (!isMounted) return;

        const html5QrCode = new Html5Qrcode(containerId);
        qrCodeRef.current = html5QrCode;

        await html5QrCode.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: (width: number, height: number) => {
              const size = Math.min(width, height) * 0.7;
              return { width: Math.floor(size), height: Math.floor(size) };
            },
          },
          (decodedText: string) => {
            if (isMounted) {
              onScanSuccess(decodedText);
            }
          },
          () => {
            // Silence noisy scan debug logs from html5-qrcode
          }
        );
        setHasPermission(true);
      } catch (err: any) {
        console.error('QR start error:', err);
        if (isMounted) {
          setError(err.message || 'Failed to start camera. Please check camera permissions.');
          setHasPermission(false);
        }
      }
    };

    startScanner();

    return () => {
      isMounted = false;
      const cleanup = async () => {
        if (qrCodeRef.current) {
          try {
            if (qrCodeRef.current.isScanning) {
              await qrCodeRef.current.stop();
            }
          } catch (e) {
            console.error('Failed to stop QR scanner on unmount:', e);
          }
          qrCodeRef.current = null;
        }
      };
      cleanup();
    };
  }, [isOpen, onScanSuccess]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 px-4">
      <div className="glass w-full max-w-md p-6 rounded-3xl border border-white/10 relative flex flex-col items-center">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white transition"
          title="Close scanner"
        >
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
          <Camera className="w-5 h-5 text-brand-400" /> Scan Queue QR Code
        </h3>
        <p className="text-gray-400 text-xs text-center mb-6">
          Align the queue's QR code within the camera scanner box.
        </p>

        {/* Scanner Feed Container */}
        <div className="w-full aspect-square max-w-[280px] bg-black/50 border border-white/15 rounded-2xl overflow-hidden relative mb-4">
          <div id={containerId} className="w-full h-full" />
          
          {hasPermission === null && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 bg-[#090d16]/90 z-10">
              <div className="w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin mb-3"></div>
              <span className="text-xs text-gray-400">Requesting camera access...</span>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-[#090d16]/95 z-10">
              <ShieldAlert className="w-10 h-10 text-red-500 mb-3 animate-pulse" />
              <h4 className="text-white font-bold text-sm mb-1">Camera Error</h4>
              <p className="text-xs text-gray-500 leading-relaxed">{error}</p>
              <button
                onClick={() => {
                  setError(null);
                  setHasPermission(null);
                  onClose();
                }}
                className="mt-4 px-4 py-2 bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300 text-xs font-semibold rounded-xl transition"
              >
                Close and Try Again
              </button>
            </div>
          )}
        </div>

        <div className="text-[10px] text-gray-500 text-center uppercase tracking-wider font-semibold">
          Powered by HTML5 QR Code
        </div>
      </div>
    </div>
  );
};
