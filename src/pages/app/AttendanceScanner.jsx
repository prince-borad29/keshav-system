import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, X, CheckCircle2, AlertCircle, Camera 
} from 'lucide-react';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';

export default function AttendanceScanner() {
  const navigate = useNavigate();
  
  // UI State
  const [isScanning, setIsScanning] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null); 
  const [permissionError, setPermissionError] = useState(null);

  // Prevent double scans
  const isProcessingRef = useRef(false);

  useEffect(() => {
    // Cleanup when leaving the page
    return () => {
      stopScan();
    };
  }, []);

  // --- 1. START SCANNING LOGIC ---
  const startScan = async () => {
    try {
      // A. Check/Request Permissions
      const { camera } = await BarcodeScanner.requestPermissions();
      if (camera !== 'granted' && camera !== 'limited') {
        setPermissionError("Camera permission denied.");
        return;
      }

      // B. Hide Background (Crucial for Native Scanner)
      document.body.style.backgroundColor = 'transparent';
      document.body.style.opacity = '0'; // Sometimes needed to force transparency on root
      setIsScanning(true);

      // C. Start Listener
      await BarcodeScanner.addListener('barcodeScanned', async (result) => {
        if (isProcessingRef.current) return;
        
        const rawValue = result.barcode.rawValue;
        handleScannedCode(rawValue);
      });

      // D. Open Camera
      await BarcodeScanner.startScan(); 
      
      // E. Make the view transparent (restore body opacity but keep background clear)
      document.body.style.opacity = '1'; 

    } catch (error) {
      console.error(error);
      stopScan();
      setPermissionError("Failed to start camera: " + error.message);
    }
  };

  // --- 2. STOP SCANNING LOGIC ---
  const stopScan = async () => {
    setIsScanning(false);
    document.body.style.backgroundColor = ''; // Restore White Background
    await BarcodeScanner.removeAllListeners();
    await BarcodeScanner.stopScan();
  };

  // --- 3. PROCESS THE CODE ---
  const handleScannedCode = async (rawValue) => {
    isProcessingRef.current = true;
    
    // Stop scanning temporarily to show success message
    await BarcodeScanner.stopScan(); 
    setIsScanning(false);
    document.body.style.backgroundColor = ''; // Restore background to show UI

    // --- YOUR LOGIC HERE (Simulate DB Call) ---
    setStatusMessage({
      type: 'success',
      text: `Scanned: ${rawValue}`
    });

    // Resume after 2 seconds
    setTimeout(() => {
      setStatusMessage(null);
      isProcessingRef.current = false;
      // create a "Scan Again" button or auto-restart
    }, 3000);
  };

  // --- 4. RENDER UI ---
  
  // IF SCANNING: Show almost nothing (Camera is visible behind)
  if (isScanning) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col justify-between p-6">
        {/* Top: Close Button */}
        <div className="flex justify-end pt-safe-top">
          <button onClick={stopScan} className="p-3 bg-white/20 backdrop-blur-md rounded-full text-white border border-white/30">
            <X size={24} />
          </button>
        </div>

        {/* Center: Scan Frame Overlay */}
        <div className="flex-1 flex items-center justify-center">
          <div className="w-72 h-72 border-2 border-white/50 rounded-xl relative">
             <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-xl"></div>
             <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-xl"></div>
             <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-xl"></div>
             <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-xl"></div>
          </div>
        </div>

        {/* Bottom: Instruction */}
        <div className="text-center pb-safe-bottom">
           <p className="text-white font-bold text-shadow-sm bg-black/30 inline-block px-4 py-1 rounded-full backdrop-blur-sm">Scanning...</p>
        </div>
      </div>
    );
  }

  // IF NOT SCANNING: Show Dashboard / Start Button
  return (
    <div className="flex flex-col h-screen bg-[#002B3D]">
      
      {/* Header */}
      <div className="bg-[#002B3D] text-white px-4 py-3 flex justify-between items-center pt-safe-top">
        <div className="flex items-center gap-3">
           <h1 className="text-lg font-bold">Attendance Scanner</h1>
        </div>
        <button onClick={() => navigate(-1)} className="p-2 bg-white/10 rounded-full"><X size={20}/></button>
      </div>

      {/* Main Content */}
      <div className="flex-1 bg-slate-50 rounded-t-3xl flex flex-col items-center justify-center p-6 relative">
        
        {/* Status Message */}
        {statusMessage && (
           <div className={`absolute top-6 left-6 right-6 p-4 rounded-xl flex items-center gap-3 text-white font-bold shadow-lg animate-in fade-in slide-in-from-top-4 ${statusMessage.type === 'success' ? 'bg-green-600' : 'bg-red-500'}`}>
              <CheckCircle2 size={24} />
              {statusMessage.text}
           </div>
        )}

        {/* Start Button */}
        <div className="text-center">
           <div className="w-24 h-24 bg-sky-100 text-[#002B3D] rounded-full flex items-center justify-center mx-auto mb-6">
              <Camera size={48} />
           </div>
           <h2 className="text-2xl font-bold text-[#002B3D] mb-2">Ready to Scan</h2>
           <p className="text-slate-500 mb-8 max-w-xs mx-auto">Tap the button below to open the camera and start logging attendance.</p>
           
           <button 
             onClick={startScan} 
             className="w-full max-w-xs py-4 bg-[#002B3D] text-white font-bold text-lg rounded-2xl shadow-xl hover:bg-[#155e7a] transition-all active:scale-95 flex items-center justify-center gap-3"
           >
             <Camera size={24} /> Start Scanner
           </button>

           {permissionError && (
             <p className="text-red-500 font-medium mt-6 flex items-center justify-center gap-2"><AlertCircle size={16}/> {permissionError}</p>
           )}
        </div>

      </div>
    </div>
  );
}