import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  X, CheckCircle2, AlertCircle, Camera, Loader2 
} from 'lucide-react';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import { supabase } from '../../lib/supabase';
import { decryptMemberData } from '../../lib/qrUtils'; // Import decryption logic
import { useAuth } from '../../contexts/AuthContext';

export default function AttendanceScanner() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const { event, members } = state || {}; // Get event and scoped members from navigation state
  const { profile } = useAuth();
  
  // UI State
  const [isScanning, setIsScanning] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null); 
  const [permissionError, setPermissionError] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Prevent double scans and maintain state access in listener
  const isProcessingRef = useRef(false);

  useEffect(() => {
    if (!event) {
      alert("No active event found. Returning to dashboard.");
      navigate('/home');
    }
    return () => stopScan();
  }, [event, navigate]);

  // --- 1. START SCANNING LOGIC ---
  const startScan = async () => {
    try {
      const { camera } = await BarcodeScanner.requestPermissions();
      if (camera !== 'granted' && camera !== 'limited') {
        setPermissionError("Camera permission denied.");
        return;
      }

      // Prepare UI for native overlay
      document.body.style.backgroundColor = 'transparent';
      setIsScanning(true);

      // Start Listener
      await BarcodeScanner.addListener('barcodeScanned', async (result) => {
        if (isProcessingRef.current) return;
        handleScannedCode(result.barcode.rawValue);
      });

      await BarcodeScanner.startScan(); 
    } catch (error) {
      console.error(error);
      stopScan();
      setPermissionError("Failed to start camera: " + error.message);
    }
  };

  // --- 2. STOP SCANNING LOGIC ---
  const stopScan = async () => {
    setIsScanning(false);
    document.body.style.backgroundColor = ''; 
    await BarcodeScanner.removeAllListeners();
    await BarcodeScanner.stopScan();
  };

  // --- 3. PROCESS THE CODE (Decryption & DB) ---
 const handleScannedCode = async (detectedCodes) => {
  if (!detectedCodes?.length || isProcessingRef.current) return;
  
  const rawValue = detectedCodes[0].rawValue;
  
  // ✅ STEP 1: Decrypt the raw value locally
  const decrypted = decryptMemberData(rawValue);

  // ✅ STEP 2: Validate decryption
  if (!decrypted || !decrypted.id) {
    console.error("Decryption failed or invalid QR format");
    setStatusMessage({ type: 'error', text: 'Invalid/Unauthorized QR Code' });
    return;
  }

  // ✅ STEP 3: Use the REAL ID (e.g., BP12490) to find the member
  const memberId = decrypted.id.trim();

  try {
    // If you are searching in the local 'members' list:
    const member = members.find(m => m.id === memberId);
    
    if (!member) {
       throw new Error("Member not found in your scope");
    }

    // Now proceed to mark attendance with the verified memberId
    onScanSuccess(memberId); 
    
  } catch (err) {
    console.error("Scanner Error:", err.message);
    // This will now show the correct error instead of a 406
  }
};

  const showStatus = (type, text) => {
    setStatusMessage({ type, text });
    setIsProcessing(false);
    
    // Auto-clear message after 3 seconds, allowing for a fresh scan
    setTimeout(() => {
      setStatusMessage(null);
      isProcessingRef.current = false;
    }, 3000);
  };

  // --- 4. RENDER UI ---
  
  if (isScanning) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col justify-between p-6">
        <div className="flex justify-end pt-safe-top">
          <button onClick={stopScan} className="p-3 bg-white/20 backdrop-blur-md rounded-full text-white border border-white/30">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 flex items-center justify-center">
          <div className="w-72 h-72 border-2 border-white/30 rounded-3xl relative">
             <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-white rounded-tl-3xl"></div>
             <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-white rounded-tr-3xl"></div>
             <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-white rounded-bl-3xl"></div>
             <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-white rounded-br-3xl"></div>
             {/* Scanning Line Animation */}
             <div className="absolute top-0 left-0 right-0 h-1 bg-white/50 shadow-[0_0_15px_rgba(255,255,255,0.8)] animate-scan"></div>
          </div>
        </div>

        <div className="text-center pb-safe-bottom">
           <p className="text-white font-bold bg-black/40 inline-block px-6 py-2 rounded-full backdrop-blur-md">
             Align QR Code inside frame
           </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#002B3D]">
      <div className="bg-[#002B3D] text-white px-4 py-3 flex justify-between items-center pt-safe-top">
        <div className="flex items-center gap-3">
           <h1 className="text-lg font-bold">Attendance Scanner</h1>
        </div>
        <button onClick={() => navigate(-1)} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors">
          <X size={20}/>
        </button>
      </div>

      <div className="flex-1 bg-slate-50 rounded-t-3xl flex flex-col items-center justify-center p-6 relative">
        
        {statusMessage && (
           <div className={`absolute top-6 left-6 right-6 p-5 rounded-2xl flex items-center gap-3 text-white font-bold shadow-xl animate-in fade-in slide-in-from-top-4 duration-300 ${statusMessage.type === 'success' ? 'bg-green-600' : 'bg-red-500'}`}>
              {statusMessage.type === 'success' ? <CheckCircle2 size={28} /> : <AlertCircle size={28} />}
              <span className="text-lg">{statusMessage.text}</span>
           </div>
        )}

        <div className="text-center w-full max-w-xs">
           <div className="w-32 h-32 bg-sky-50 text-[#002B3D] rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner">
              {isProcessing ? (
                <Loader2 size={56} className="animate-spin text-sky-600" />
              ) : (
                <Camera size={56} className="text-[#002B3D]" />
              )}
           </div>
           
           <h2 className="text-2xl font-bold text-[#002B3D] mb-3">
             {isProcessing ? "Processing..." : "Ready to Scan"}
           </h2>
           <p className="text-slate-500 mb-10 leading-relaxed">
             Logging for: <br/>
             <strong className="text-[#002B3D]">{event?.name}</strong>
           </p>
           
           <button 
             onClick={startScan} 
             disabled={isProcessing || !!statusMessage}
             className={`w-full py-4 rounded-2xl font-bold text-xl shadow-2xl transition-all flex items-center justify-center gap-3 active:scale-95 ${isProcessing || !!statusMessage ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-[#002B3D] text-white hover:bg-[#155e7a]'}`}
           >
             <Camera size={24} /> 
             {statusMessage ? "Scanning Paused" : "Start Scanner"}
           </button>

           {permissionError && (
             <div className="mt-8 p-4 bg-red-50 text-red-600 rounded-xl flex items-center gap-2 text-sm font-bold">
               <AlertCircle size={18}/> {permissionError}
             </div>
           )}
        </div>
      </div>
    </div>
  );
}