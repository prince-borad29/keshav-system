import React, { useState, useEffect, useRef } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner'; // ✅ New Modern Library
import { X, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function QRScanner({ isOpen, onClose, event, onScanSuccess }) {
  const [message, setMessage] = useState(null); // { type: 'success'|'error', text: '' }
  const [isProcessing, setIsProcessing] = useState(false);
  const lastScannedRef = useRef(null);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setMessage(null);
      setIsProcessing(false);
      lastScannedRef.current = null;
    }
  }, [isOpen]);

  const handleScan = async (detectedCodes) => {
    // The library returns an array of detected codes
    if (!detectedCodes || detectedCodes.length === 0 || isProcessing) return;

    const rawValue = detectedCodes[0].rawValue; // ✅ Get the actual text
    
    // Prevent double-scanning the same person immediately
    if (lastScannedRef.current === rawValue) return;

    setIsProcessing(true);
    lastScannedRef.current = rawValue;

    try {
      // 1. Verify Member Exists
      const { data: memberData, error } = await supabase
        .from('members')
        .select('id, name, surname')
        .eq('id', rawValue)
        .single();

      if (error || !memberData) {
        throw new Error("Member not found");
      }

      // 2. Mark Attendance
      await supabase
        .from('attendance')
        .upsert([{ event_id: event.id, member_id: rawValue }], { onConflict: 'event_id, member_id' });

      // 3. Show Success
      setMessage({ type: 'success', text: `Welcome! ${memberData.name} ${memberData.surname}` });
      if (onScanSuccess) onScanSuccess(rawValue);

    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: "Invalid ID or Not Found" });
    }

    // Reset after 2.5 seconds to scan the next person
    setTimeout(() => {
      setMessage(null);
      setIsProcessing(false);
      lastScannedRef.current = null;
    }, 2500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10 bg-gradient-to-b from-black/80 to-transparent text-white">
        <div>
           <h2 className="text-lg font-bold">Scan QR Code</h2>
           <p className="text-xs opacity-80">{event?.name}</p>
        </div>
        <button onClick={onClose} className="p-2 bg-white/20 rounded-full hover:bg-white/30 backdrop-blur-md">
          <X size={24} />
        </button>
      </div>

      {/* Camera View */}
      <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
        <div className="w-full h-full relative">
          <Scanner 
            onScan={handleScan}
            components={{ 
              audio: false,     // Disable beep (optional)
              finder: false     // We draw our own custom finder below
            }}
            styles={{
              container: { width: '100%', height: '100%' },
              video: { width: '100%', height: '100%', objectFit: 'cover' }
            }}
          />
        </div>

        {/* Custom Framing Box (Visual Guide) */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
             <div className="w-64 h-64 border-2 border-white/50 rounded-3xl relative">
                <div className="absolute inset-0 border-[3px] border-sky-400 rounded-3xl animate-pulse opacity-50"></div>
                {/* Corners */}
                <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-sky-500 rounded-tl-xl"></div>
                <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-sky-500 rounded-tr-xl"></div>
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-sky-500 rounded-bl-xl"></div>
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-sky-500 rounded-br-xl"></div>
             </div>
        </div>
        
        <p className="absolute bottom-24 text-white/70 text-sm font-medium bg-black/40 px-4 py-2 rounded-full backdrop-blur-sm pointer-events-none">
          Place QR code within the frame
        </p>

        {/* SUCCESS / ERROR POPUP */}
        {message && (
           <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center gap-3 p-8 rounded-3xl shadow-2xl animate-in zoom-in-95 duration-200 backdrop-blur-md border ${message.type === 'success' ? 'bg-green-600/95 border-green-400 text-white' : 'bg-red-600/95 border-red-400 text-white'} z-50`}>
              {message.type === 'success' ? <CheckCircle size={56} className="fill-white text-green-700" /> : <AlertCircle size={56} className="fill-white text-red-700" />}
              <span className="text-xl font-bold text-center">{message.text}</span>
           </div>
        )}
      </div>
    </div>
  );
}