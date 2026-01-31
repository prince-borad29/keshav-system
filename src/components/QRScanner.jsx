import React, { useState, useEffect, useRef } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner'; 
import { X, CheckCircle, AlertCircle } from 'lucide-react';
import { decryptMemberData } from '../lib/qrUtils';

export default function QRScanner({ isOpen, onClose, event, onScanSuccess, 
  
  
  members = [] }) {
  const [message, setMessage] = useState(null); 
  const [isProcessing, setIsProcessing] = useState(false);
  const lastScannedRef = useRef(null);
  
  // ✅ FIX 1: Define the missing ref
  const isProcessingRef = useRef(false);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setMessage(null);
      setIsProcessing(false);
      lastScannedRef.current = null;
      isProcessingRef.current = false;
    }
  }, [isOpen]);

  const handleScan = async (detectedCodes) => {
    // ✅ Check if ref exists before accessing .current
    if (!detectedCodes?.length || isProcessingRef.current) return;
    
    const rawValue = detectedCodes[0].rawValue;
    
    // Prevent double scanning the same code instantly
    if (lastScannedRef.current === rawValue) return;
    lastScannedRef.current = rawValue;

    // Lock processing
    isProcessingRef.current = true;
    setIsProcessing(true);

    // 1. Decrypt
    const decrypted = decryptMemberData(rawValue);    
    
    // 2. Validate
    if (!decrypted || !decrypted.id) {
      showStatus('error', 'Invalid or Unauthorized QR');
      return;
    }

    const memberId = decrypted.id.trim();

    try {
      // ✅ FIX 2: Ensure 'members' prop is passed correctly
      const member = members.find(m => m.id === memberId);
      
      if (!member) {
         throw new Error("Member not in your list");
      }

      // 3. Success
      onScanSuccess(memberId); 
      showStatus('success', `Marked: ${member.name}`);
      
    } catch (err) {
      console.error("Scanner Error:", err.message);
      showStatus('error', err.message);
    }
  };

  // ✅ FIX 3: Helper function to handle messages
  const showStatus = (type, text) => {
    setMessage({ type, text });
    
    setTimeout(() => {
      setMessage(null);
      setIsProcessing(false);
      isProcessingRef.current = false;
      lastScannedRef.current = null; // Allow re-scan after delay
    }, 2000);
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
            components={{ audio: false, finder: false }}
            styles={{
              container: { width: '100%', height: '100%' },
              video: { width: '100%', height: '100%', objectFit: 'cover' }
            }}
          />
        </div>

        {/* Framing Box */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
             <div className="w-64 h-64 border-2 border-white/50 rounded-3xl relative">
                <div className="absolute inset-0 border-[3px] border-sky-400 rounded-3xl animate-pulse opacity-50"></div>
                <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-sky-500 rounded-tl-xl"></div>
                <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-sky-500 rounded-tr-xl"></div>
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-sky-500 rounded-bl-xl"></div>
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-sky-500 rounded-br-xl"></div>
             </div>
        </div>
        
        <p className="absolute bottom-24 text-white/70 text-sm font-medium bg-black/40 px-4 py-2 rounded-full backdrop-blur-sm pointer-events-none">
          Place QR code within the frame
        </p>

        {/* Status Message Popup */}
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