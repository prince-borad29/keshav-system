import React, { useState, useRef, useEffect } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { X, CheckCircle, AlertTriangle, XCircle, Zap } from 'lucide-react';

export default function TurboScanner({ isOpen, onClose, onScan }) {
  const [feedback, setFeedback] = useState(null); // null | { type: 'success'|'error'|'warning', msg: '' }
  const lastScannedCode = useRef(null);
  const isProcessing = useRef(false);

  // Auto-clear feedback after 1.2s
  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => {
        setFeedback(null);
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  const handleScan = async (result) => {
    const rawCode = result[0]?.rawValue;
    
    // 1. BLOCK: If no code, or currently processing, or same code scanned recently
    if (!rawCode || isProcessing.current) return;
    if (rawCode === lastScannedCode.current) return;

    // 2. LOCK
    isProcessing.current = true;
    lastScannedCode.current = rawCode;

    // 3. PROCESS (Call Parent)
    // The parent function returns the result object { success: true, message: "..." }
    const resultData = await onScan(rawCode);    

    // 4. SHOW FEEDBACK (Camera keeps running in background)
    setFeedback({
      type: resultData.type, // 'success', 'warning', 'error'
      msg: resultData.message,
      name: resultData.member?.name
    });

    // 5. UNLOCK (Allow next scan after small delay)
    setTimeout(() => {
      isProcessing.current = false;
      // We keep lastScannedCode populated for 3s to prevent double-scanning same person immediately
      setTimeout(() => { lastScannedCode.current = null; }, 1200); 
    }, 1000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* HEADER */}
      <div className="absolute top-0 w-full p-4 flex justify-between items-center z-20 bg-gradient-to-b from-black/80 to-transparent">
        <div className="text-white">
           <h2 className="font-bold text-lg">Turbo Scanner</h2>
           <div className="flex items-center gap-1 text-xs text-green-400 font-medium animate-pulse">
             <Zap size={12} fill="currentColor"/> Live Feed Active
           </div>
        </div>
        <button onClick={onClose} className="p-3 bg-white/20 backdrop-blur-md rounded-full text-white hover:bg-white/30">
          <X size={24} />
        </button>
      </div>

      {/* CAMERA */}
      <div className="flex-1 relative bg-black">
        <Scanner 
          onScan={handleScan}
          paused={false} // NEVER PAUSE CAMERA
          scanDelay={100} // Check very frequently
          allowMultiple={true}
          components={{ audio: false, finder: false }} // SILENT
          styles={{ container: { height: '100%' }, video: { objectFit: 'contain' } }}
        />

        {/* FEEDBACK OVERLAY (Appears ON TOP of video) */}
        {feedback && (
           <div className={`absolute inset-0 z-30 flex flex-col items-center justify-center backdrop-blur-sm animate-in fade-in duration-200 ${
              feedback.type === 'success' ? 'bg-green-500/80' : 
              feedback.type === 'warning' ? 'bg-orange-500/80' : 'bg-red-500/80'
           }`}>
              <div className="bg-white p-4 rounded-full shadow-2xl mb-4 transform scale-125">
                 {feedback.type === 'success' && <CheckCircle size={48} className="text-green-600" />}
                 {feedback.type === 'warning' && <AlertTriangle size={48} className="text-orange-600" />}
                 {feedback.type === 'error' && <XCircle size={48} className="text-red-600" />}
              </div>
              <h2 className="text-3xl font-bold text-white text-center px-4 leading-tight mb-1">
                {feedback.name || (feedback.type === 'success' ? "Success" : "Error")}
              </h2>
              <p className="text-white/90 text-lg font-medium">{feedback.msg}</p>
           </div>
        )}
        
        {/* FINDER BOX (Only visible when no feedback) */}
        {!feedback && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
             <div className="w-64 h-64 border-2 border-white/50 rounded-2xl relative">
                <div className="absolute top-0 left-0 w-8 h-8 border-l-4 border-t-4 border-white rounded-tl-lg"></div>
                <div className="absolute top-0 right-0 w-8 h-8 border-r-4 border-t-4 border-white rounded-tr-lg"></div>
                <div className="absolute bottom-0 left-0 w-8 h-8 border-l-4 border-b-4 border-white rounded-bl-lg"></div>
                <div className="absolute bottom-0 right-0 w-8 h-8 border-r-4 border-b-4 border-white rounded-br-lg"></div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}