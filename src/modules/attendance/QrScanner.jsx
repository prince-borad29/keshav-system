import React, { useRef, useCallback } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { X, Activity, Flashlight, FlashlightOff } from 'lucide-react';
import toast from 'react-hot-toast';

export default function QrScanner({ isOpen, onClose, onScan, eventName }) {
  const [flashlightOn, setFlashlightOn] = React.useState(false);
  const lastScannedCode = useRef(null);
  const isProcessing = useRef(false);

  const handleScan = useCallback(async (result) => {
    const rawCode = result[0]?.rawValue;
    // ⚡ RAPID FIRE: Cooldown is now only 300ms instead of 1200ms
    if (!rawCode || isProcessing.current || rawCode === lastScannedCode.current) return;

    isProcessing.current = true;
    lastScannedCode.current = rawCode;

    const resultData = await onScan(rawCode);    

    // Use a non-blocking toast instead of a screen-locking overlay
    if (resultData.success) {
      toast.success(`${resultData.message}`, { position: 'top-center', duration: 1500 });
      // If it's a specific single-entry event, you can still close it, otherwise stay open!
      if (eventName?.includes("Map Badge")) onClose(); 
    } else {
      toast.error(`${resultData.message}`, { position: 'top-center', duration: 2000 });
    }

    // Unlock the scanner in just 300ms
    setTimeout(() => {
      isProcessing.current = false;
      setTimeout(() => { lastScannedCode.current = null; }, 1000); // Prevent accidental double-scan of same person
    }, 300);
  }, [onScan, eventName, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col animate-in fade-in duration-100">
      <div className="absolute top-0 w-full px-5 py-4 flex justify-between items-center z-20 bg-gradient-to-b from-black/80 to-transparent">
        <div>
           <h2 className="font-bold text-base text-white">{eventName || "Rapid Scanner"}</h2>
           <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-semibold tracking-widest uppercase mt-0.5">
             <Activity size={12} strokeWidth={2} className="animate-pulse"/> Scanning
           </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button onClick={() => setFlashlightOn(!flashlightOn)} className="p-2 bg-white/10 hover:bg-white/20 border border-white/10 backdrop-blur-md rounded-md text-white transition-colors">
            {flashlightOn ? <Flashlight size={18} strokeWidth={2} /> : <FlashlightOff size={18} strokeWidth={2} />}
          </button>
          <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 border border-white/10 backdrop-blur-md rounded-md text-white transition-colors">
            <X size={18} strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="flex-1 relative">
        <Scanner 
          onScan={handleScan}
          scanDelay={100} // Scans up to 10 times a second
          allowMultiple={true}
          components={{ audio: true, finder: false }} // Enabled audio for instant feedback
          styles={{ container: { height: '100%' }, video: { objectFit: 'cover' } }}
          constraints={{ facingMode: 'environment', advanced: flashlightOn ? [{ torch: true }] : undefined }}
        />

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
           <div className="w-64 h-64 border border-white/40 relative shadow-[0_0_0_4000px_rgba(0,0,0,0.4)]">
              {/* Target brackets */}
              <div className="absolute top-0 left-0 w-8 h-8 border-l-4 border-t-4 border-emerald-400"></div>
              <div className="absolute top-0 right-0 w-8 h-8 border-r-4 border-t-4 border-emerald-400"></div>
              <div className="absolute bottom-0 left-0 w-8 h-8 border-l-4 border-b-4 border-emerald-400"></div>
              <div className="absolute bottom-0 right-0 w-8 h-8 border-r-4 border-b-4 border-emerald-400"></div>
           </div>
        </div>
      </div>
    </div>
  );
}