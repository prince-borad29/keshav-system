import React, { useRef, useCallback, useState } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { X, Activity, Flashlight, FlashlightOff } from 'lucide-react';
import toast from 'react-hot-toast';

export default function QrScanner({ isOpen, onClose, onScan, eventName }) {
  const [flashlightOn, setFlashlightOn] = useState(false);
  const lastScannedCode = useRef(null);
  const isProcessing = useRef(false);

  // ⚡ INSTANT FLASHLIGHT TOGGLE (Zero Lag)
  // Manipulates the raw video track instead of forcing React to remount the camera
  const toggleFlashlight = async () => {
    try {
      const videoElement = document.querySelector('video');
      if (!videoElement || !videoElement.srcObject) {
        toast.error("Camera is not ready yet.");
        return;
      }

      const track = videoElement.srcObject.getVideoTracks()[0];
      
      // Check if browser/hardware supports torch
      const capabilities = track.getCapabilities ? track.getCapabilities() : {};
      const settings = track.getSettings ? track.getSettings() : {};
      
      if (!capabilities.torch && !('torch' in settings)) {
        toast.error("Flashlight not supported on this browser/device.");
        return;
      }

      const newState = !flashlightOn;
      await track.applyConstraints({
        advanced: [{ torch: newState }]
      });
      
      setFlashlightOn(newState);
    } catch (error) {
      console.error("Flashlight error:", error);
      toast.error("Could not toggle flashlight.");
      setFlashlightOn(false); // Reset state if hardware fails
    }
  };

  const handleScan = useCallback(async (result) => {
    // Safely extract the code (handles different versions of the scanner library)
    const rawCode = Array.isArray(result) ? result[0]?.rawValue : result?.text || result;
    
    if (!rawCode || isProcessing.current || rawCode === lastScannedCode.current) return;

    isProcessing.current = true;
    lastScannedCode.current = rawCode;

    try {
      // Await the parent's scan handler
      const resultData = await onScan(rawCode);    

      // Flexible validation: works if parent returns {success, message} OR boolean
      if (resultData === true || resultData?.success) {
        toast.success(resultData?.message || `Scanned Successfully!`, { position: 'top-center', duration: 1500 });
        if (eventName?.includes("Map Badge")) onClose(); 
      } else if (resultData === false || resultData?.success === false) {
        toast.error(resultData?.message || 'Invalid or rejected code!', { position: 'top-center', duration: 2000 });
      } else {
        // Fallback if parent returns nothing
        toast.success(`Scanned: ${rawCode}`, { position: 'top-center', duration: 1500 });
      }

    } catch (error) {
      console.error("Processing error:", error);
      toast.error('Error processing scan!', { position: 'top-center', duration: 2000 });
    } finally {
      // 🛡️ CRITICAL: Always unlock the scanner inside 'finally' even if onScan crashes
      setTimeout(() => {
        isProcessing.current = false;
        // Prevent accidental double-scan of the exact same person for 1 second
        setTimeout(() => { lastScannedCode.current = null; }, 1000); 
      }, 300);
    }
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
          <button onClick={toggleFlashlight} className="p-2 bg-white/10 hover:bg-white/20 border border-white/10 backdrop-blur-md rounded-md text-white transition-colors">
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
          scanDelay={100} 
          allowMultiple={true}
          components={{ audio: true, finder: false }} 
          styles={{ container: { height: '100%' }, video: { objectFit: 'cover' } }}
          // 🛡️ Static constraints: Removing the dynamic 'advanced' array from here
          // prevents the camera from restarting when toggling the flashlight
          constraints={{ facingMode: 'environment' }}
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