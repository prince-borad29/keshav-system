import React, { useRef, useCallback, useEffect, useState } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { X, Activity, Zap, ZapOff } from 'lucide-react';
import toast from 'react-hot-toast';

export default function QrScanner({ isOpen, onClose, onScan, eventName }) {
  const [flashlightOn, setFlashlightOn] = useState(false);
  const lastScannedCode = useRef(null);
  const isProcessing = useRef(false);
  const videoTrackRef = useRef(null);

  // Grab the video track once camera starts for instant flashlight
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
    const interval = setInterval(() => { if (findTrack()) clearInterval(interval); }, 200);
    return () => { clearInterval(interval); videoTrackRef.current = null; };
  }, [isOpen]);

  const toggleFlashlight = useCallback(async () => {
    const track = videoTrackRef.current;
    if (!track) return toast.error("Camera not ready yet", { position: 'top-center', duration: 2000 });
    const capabilities = track.getCapabilities?.() || {};
    if (!capabilities.torch) return toast.error("Flashlight not supported", { position: 'top-center', duration: 2000 });

    try {
      const next = !flashlightOn;
      await track.applyConstraints({ advanced: [{ torch: next }] });
      setFlashlightOn(next);
    } catch (err) {
      toast.error("Could not toggle flashlight", { position: 'top-center', duration: 2000 });
    }
  }, [flashlightOn]);

  const handleScan = useCallback(async (result) => {
    if (!result) return;
    const rawCode = Array.isArray(result) ? result[0]?.rawValue : (result?.text || result?.rawValue || result);

    if (!rawCode || isProcessing.current || rawCode === lastScannedCode.current) return;

    isProcessing.current = true;
    lastScannedCode.current = rawCode;

    try {
      const resultData = await onScan(rawCode);
      console.log('[QrScanner] Scan result:', resultData);

      // Handle success case - attendance marked
      if (resultData?.success === true) {
        toast.success(resultData.message || 'Successfully marked present ✓', {
          position: 'top-center',
          duration: 1500,
          style: { zIndex: 10000 }
        });
        if (eventName?.includes("Map Badge")) {
          setTimeout(() => onClose(), 500);
        }
      }
      // Handle error cases - already marked, not in roster, etc
      else if (resultData?.success === false) {
        const errorMessage = resultData.message || 'Already marked or not found';
        toast.error(errorMessage, {
          position: 'top-center',
          duration: 1500,
          style: { zIndex: 10000 }
        });
      }
      // Fallback - shouldn't normally happen
      else {
        toast.error('Unable to process scan. Please try again.', {
          position: 'top-center',
          duration: 1500,
          style: { zIndex: 10000 }
        });
      }
    } catch (err) {
      console.error('[QrScanner] Error:', err);
      toast.error('Network error - check your connection', {
        position: 'top-center',
        duration: 1500,
        style: { zIndex: 10000 }
      });
    }

    // Unlock scanner instantly for rapid fire scanning
    isProcessing.current = false;
    setTimeout(() => { lastScannedCode.current = null; }, 800);
  }, [onScan, eventName, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] h-[100dvh] w-full bg-black flex flex-col animate-in fade-in duration-100">
      {/* Header */}
      <div
        className="absolute top-0 inset-x-0 z-20 flex items-center justify-between gap-3
                   px-3 sm:px-5 md:px-8 pb-3 sm:pb-4
                   bg-gradient-to-b from-black/80 to-transparent"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-sm sm:text-base md:text-lg text-white truncate">
            {eventName || "Rapid Scanner"}
          </h2>
          <div className="flex items-center gap-1.5 text-[10px] md:text-xs text-emerald-400 font-semibold tracking-widest uppercase mt-0.5">
            <Activity size={12} strokeWidth={2} className="animate-pulse" /> Scanning
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            onClick={toggleFlashlight}
            aria-label="Toggle flashlight"
            className={`h-11 w-11 sm:h-10 sm:w-10 md:h-12 md:w-12 flex items-center justify-center border backdrop-blur-md rounded-md text-white transition-colors ${
              flashlightOn
                ? 'bg-yellow-400/30 border-yellow-400/50 text-yellow-300'
                : 'bg-white/10 hover:bg-white/20 border-white/10'
            }`}
          >
            {flashlightOn
              ? <Zap size={20} strokeWidth={2} fill="currentColor" />
              : <ZapOff size={20} strokeWidth={2} />}
          </button>
          <button
            onClick={onClose}
            aria-label="Close scanner"
            className="h-11 w-11 sm:h-10 sm:w-10 md:h-12 md:w-12 flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/10 backdrop-blur-md rounded-md text-white transition-colors"
          >
            <X size={20} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Camera area */}
      <div className="flex-1 relative min-h-0">
        <Scanner
          onScan={handleScan}    // For v2.x of the library
          onResult={handleScan}  // For v1.x of the library
          scanDelay={100}
          allowMultiple={true}
          components={{ audio: true, finder: false }}
          styles={{ container: { height: '100%' }, video: { objectFit: 'cover' } }}
          constraints={{ facingMode: 'environment' }}
        />

        {/* Finder frame: scales with screen, fits portrait, landscape and tablets */}
        <div className="absolute inset-0 flex flex-col items-center justify-center px-4 pointer-events-none">
          <div className="relative aspect-square w-[min(70vw,55vh,24rem)] border border-white/40 shadow-[0_0_0_100vmax_rgba(0,0,0,0.4)]">
            <div className="absolute top-0 left-0 w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 border-l-4 border-t-4 border-emerald-400" />
            <div className="absolute top-0 right-0 w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 border-r-4 border-t-4 border-emerald-400" />
            <div className="absolute bottom-0 left-0 w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 border-l-4 border-b-4 border-emerald-400" />
            <div className="absolute bottom-0 right-0 w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 border-r-4 border-b-4 border-emerald-400" />
          </div>
          <p className="relative mt-4 md:mt-6 text-center text-xs md:text-sm text-white/80 [@media(max-height:500px)]:hidden">
            Align the QR code inside the frame
          </p>
        </div>
      </div>
    </div>
  );
}