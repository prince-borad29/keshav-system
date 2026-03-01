import React, { useState, useRef, useEffect } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { X, CheckCircle, AlertTriangle, XCircle, Activity } from 'lucide-react';

export default function QrScanner({ isOpen, onClose, onScan, eventName }) {
  const [feedback, setFeedback] = useState(null); 
  const lastScannedCode = useRef(null);
  const isProcessing = useRef(false);

  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => {
        setFeedback(null);
        if (feedback.type === 'success' && eventName?.includes("Map Badge")) onClose();
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [feedback, eventName, onClose]);

  const handleScan = async (result) => {
    const rawCode = result[0]?.rawValue;
    if (!rawCode || isProcessing.current || rawCode === lastScannedCode.current) return;

    isProcessing.current = true;
    lastScannedCode.current = rawCode;

    const resultData = await onScan(rawCode);    

    setFeedback({
      type: resultData.type || (resultData.success ? 'success' : 'error'), 
      msg: resultData.message,
      name: resultData.member?.name
    });

    setTimeout(() => {
      isProcessing.current = false;
      setTimeout(() => { lastScannedCode.current = null; }, 1200); 
    }, 1000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-gray-950 flex flex-col animate-in fade-in duration-200">
      {/* Sleek Dark Header */}
      <div className="absolute top-0 w-full px-5 py-4 flex justify-between items-center z-20 bg-gradient-to-b from-black/60 to-transparent">
        <div>
           <h2 className="font-bold text-base text-white">{eventName || "Fast Scanner"}</h2>
           <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-semibold tracking-widest uppercase mt-0.5">
             <Activity size={12} strokeWidth={2}/> Active
           </div>
        </div>
        <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 border border-white/10 backdrop-blur-md rounded-md text-white transition-colors">
          <X size={18} strokeWidth={2} />
        </button>
      </div>

      {/* Viewport */}
      <div className="flex-1 relative">
        <Scanner 
          onScan={handleScan}
          paused={false} 
          scanDelay={100} 
          allowMultiple={true}
          components={{ audio: false, finder: false }} 
          styles={{ container: { height: '100%' }, video: { objectFit: 'cover' } }}
        />

        {/* Feedback Overlay - Flat and direct */}
        {feedback && (
           <div className={`absolute inset-0 z-30 flex flex-col items-center justify-center backdrop-blur-sm animate-in fade-in duration-150 ${
              feedback.type === 'success' ? 'bg-emerald-900/90' : 
              feedback.type === 'warning' ? 'bg-amber-900/90' : 'bg-red-900/90'
           }`}>
              <div className="bg-white/10 border border-white/20 p-5 rounded-md shadow-[0_4px_20px_rgba(0,0,0,0.5)] mb-4 backdrop-blur-md">
                 {feedback.type === 'success' && <CheckCircle size={40} className="text-emerald-400" strokeWidth={1.5} />}
                 {feedback.type === 'warning' && <AlertTriangle size={40} className="text-amber-400" strokeWidth={1.5} />}
                 {feedback.type === 'error' && <XCircle size={40} className="text-red-400" strokeWidth={1.5} />}
              </div>
              <h2 className="text-2xl font-bold text-white text-center px-4 leading-tight mb-1">
                {feedback.name || (feedback.type === 'success' ? "Success" : "Error")}
              </h2>
              <p className="text-white/70 text-sm font-medium">{feedback.msg}</p>
           </div>
        )}
        
        {/* Finder Box - Sharp borders instead of rounded-2xl */}
        {!feedback && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
             <div className="w-64 h-64 border border-white/20 relative">
                <div className="absolute top-0 left-0 w-6 h-6 border-l-2 border-t-2 border-white"></div>
                <div className="absolute top-0 right-0 w-6 h-6 border-r-2 border-t-2 border-white"></div>
                <div className="absolute bottom-0 left-0 w-6 h-6 border-l-2 border-b-2 border-white"></div>
                <div className="absolute bottom-0 right-0 w-6 h-6 border-r-2 border-b-2 border-white"></div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}