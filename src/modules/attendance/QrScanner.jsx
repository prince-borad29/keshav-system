import React, { useRef, useCallback, useEffect, useState } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { X, Activity, Zap, ZapOff } from 'lucide-react';
import toast from 'react-hot-toast';

export default function QrScanner({ isOpen, onClose, onScan, eventName }) {
  const [flashlightOn, setFlashlightOn] = useState(false);
  const lastScannedCode = useRef(null);
  const isProcessing = useRef(false);
  const videoTrackRef = useRef(null); // holds the live MediaStreamTrack

  // ── Grab the video track once camera starts ───────────────
  // Scanner renders a <video> — we find it and store its track
  useEffect(() => {
    if (!isOpen) return;

    const findTrack = () => {
      const video = document.querySelector('video');
      if (video?.srcObject) {
        const track = video.srcObject.getVideoTracks()[0];
        if (track) {
          videoTrackRef.current = track;
          return true;
        }
      }
      return false;
    };

    // Poll until video element is ready (usually < 500ms)
    const interval = setInterval(() => {
      if (findTrack()) clearInterval(interval);
    }, 200);

    return () => {
      clearInterval(interval);
      videoTrackRef.current = null;
    };
  }, [isOpen]);

  // ── Torch toggle — no remount, instant ───────────────────
  const toggleFlashlight = useCallback(async () => {
    const track = videoTrackRef.current;
    if (!track) {
      toast.error("Camera not ready yet", { position: 'top-center' });
      return;
    }

    const capabilities = track.getCapabilities?.() || {};
    if (!capabilities.torch) {
      toast.error("Flashlight not supported on this device", { position: 'top-center' });
      return;
    }

    try {
      const next = !flashlightOn;
      await track.applyConstraints({ advanced: [{ torch: next }] });
      setFlashlightOn(next);
    } catch (err) {
      toast.error("Could not toggle flashlight", { position: 'top-center' });
    }
  }, [flashlightOn]);

  // ── Scan handler ──────────────────────────────────────────
  const handleScan = useCallback(async (result) => {
    const rawCode = result[0]?.rawValue;
    if (!rawCode || isProcessing.current || rawCode === lastScannedCode.current) return;

    isProcessing.current = true;
    lastScannedCode.current = rawCode;

    // Visual feedback immediately — don't wait for DB
    const scanToastId = toast.loading('Checking...', { position: 'top-center' });

    try {
      const resultData = await onScan(rawCode);

      if (!resultData) {
        // Parent didn't return anything — still show scanned code
        toast.success(`Scanned: ${rawCode.slice(0, 20)}`, {
          id: scanToastId,
          position: 'top-center',
          duration: 1500,
        });
      } else if (resultData.success) {
        toast.success(resultData.message || 'Marked present ✓', {
          id: scanToastId,
          position: 'top-center',
          duration: 1500,
        });
        if (eventName?.includes("Map Badge")) onClose();
      } else {
        toast.error(resultData.message || 'Already marked or not found', {
          id: scanToastId,
          position: 'top-center',
          duration: 2000,
        });
      }
    } catch (err) {
      toast.error('Scan failed — check connection', {
        id: scanToastId,
        position: 'top-center',
        duration: 2000,
      });
    }

    // Unlock after 300ms, clear last code after 1s
    setTimeout(() => {
      isProcessing.current = false;
      setTimeout(() => { lastScannedCode.current = null; }, 1000);
    }, 300);
  }, [onScan, eventName, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col animate-in fade-in duration-100">
      {/* Header */}
      <div className="absolute top-0 w-full px-5 py-4 flex justify-between items-center z-20 bg-gradient-to-b from-black/80 to-transparent">
        <div>
          <h2 className="font-bold text-base text-white">{eventName || "Rapid Scanner"}</h2>
          <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-semibold tracking-widest uppercase mt-0.5">
            <Activity size={12} strokeWidth={2} className="animate-pulse" /> Scanning
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={toggleFlashlight}
            className={`p-2 border backdrop-blur-md rounded-md text-white transition-colors ${
              flashlightOn
                ? 'bg-yellow-400/30 border-yellow-400/50 text-yellow-300'
                : 'bg-white/10 hover:bg-white/20 border-white/10'
            }`}
          >
            {flashlightOn ? <Zap size={18} strokeWidth={2} fill="currentColor" /> : <ZapOff size={18} strokeWidth={2} />}
          </button>
          <button
            onClick={onClose}
            className="p-2 bg-white/10 hover:bg-white/20 border border-white/10 backdrop-blur-md rounded-md text-white transition-colors"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Camera — no constraints prop so it never remounts */}
      <div className="flex-1 relative">
        <Scanner
          onScan={handleScan}
          scanDelay={100}
          allowMultiple={true}
          components={{ audio: true, finder: false }}
          styles={{ container: { height: '100%' }, video: { objectFit: 'cover' } }}
          constraints={{ facingMode: 'environment' }}
        />

        {/* Viewfinder overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-64 h-64 border border-white/40 relative shadow-[0_0_0_4000px_rgba(0,0,0,0.4)]">
            <div className="absolute top-0 left-0 w-8 h-8 border-l-4 border-t-4 border-emerald-400" />
            <div className="absolute top-0 right-0 w-8 h-8 border-r-4 border-t-4 border-emerald-400" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-l-4 border-b-4 border-emerald-400" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-r-4 border-b-4 border-emerald-400" />
          </div>
        </div>
      </div>
    </div>
  );
}