import React, { useRef, useCallback, useEffect, useState } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";
import { 
  X, Activity, Zap, ZapOff, 
  Loader2, CheckCircle2, AlertOctagon 
} from "lucide-react";
import toast from "react-hot-toast";

// Audio Context Setup for distinct sounds (Only fires AFTER database responds)
let audioCtx;
const initAudio = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
};

const playSuccessBeep = () => {
  try {
    const ctx = initAudio();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880; // High pitch short beep
    g.gain.value = 0.1;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.15);
  } catch (_) {}
};

const playErrorBeep = () => {
  try {
    const ctx = initAudio();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.value = 150; // Loud, low pitch buzzer
    g.gain.value = 0.15;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.5); // Longer duration to alert volunteer
  } catch (_) {}
};

export default function QrScanner({ isOpen, onClose, onScan, eventName }) {
  const [flashlightOn, setFlashlightOn] = useState(false);
  const [scanState, setScanState] = useState("idle"); // 'idle', 'processing', 'success', 'error'
  const [scanMessage, setScanMessage] = useState("");
  
  const lastScannedCode = useRef(null);
  const isProcessing = useRef(false);
  const videoTrackRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const findTrack = () => {
      const video = document.querySelector("video");
      if (video?.srcObject) {
        const track = video.srcObject.getVideoTracks()[0];
        if (track) {
          videoTrackRef.current = track;
          return true;
        }
      }
      return false;
    };
    const interval = setInterval(() => {
      if (findTrack()) clearInterval(interval);
    }, 200);
    return () => {
      clearInterval(interval);
      videoTrackRef.current = null;
    };
  }, [isOpen]);

  const toggleFlashlight = useCallback(async () => {
    const track = videoTrackRef.current;
    if (!track) return toast.error("Camera not ready yet");
    
    const capabilities = track.getCapabilities?.() || {};
    if (!capabilities.torch) return toast.error("Flashlight not supported");

    try {
      const next = !flashlightOn;
      await track.applyConstraints({ advanced: [{ torch: next }] });
      setFlashlightOn(next);
    } catch (err) {
      toast.error("Could not toggle flashlight");
    }
  }, [flashlightOn]);

  const handleScan = useCallback(
    async (result) => {
      if (!result) return;
      
      const first = Array.isArray(result) ? result[0] : result;
      const rawCode = String(first?.rawValue ?? first?.text ?? "").trim();

      // Ignore empty reads or if we are actively communicating with DB
      if (rawCode.length < 4 || isProcessing.current) return;
      if (rawCode === lastScannedCode.current) return;

      // 1. LOCK SCANNER & SHOW VERIFYING
      isProcessing.current = true;
      lastScannedCode.current = rawCode;
      setScanState("processing");

      try {
        // 2. WAIT FOR DATABASE RESPONSE (No beeps allowed until this finishes!)
        const resultData = await onScan(rawCode);

        // 3A. DB CONFIRMS SUCCESS
        if (resultData?.success === true) {
          playSuccessBeep(); // Only beep NOW
          setScanState("success");
          setScanMessage(resultData.message || "Successfully marked present");
          
          if (eventName?.includes("Map Badge")) {
            setTimeout(() => onClose(), 500);
          }
        } 
        // 3B. DB CONFIRMS ERROR (Already marked, wrong person, etc.)
        else {
          playErrorBeep(); // Trigger harsh buzzer
          setScanState("error");
          setScanMessage(resultData?.message || "Already marked or not found");
        }
        
        // 4. UNLOCK SCANNER AFTER OVERLAY DELAY
        setTimeout(() => {
          setScanState("idle");
          isProcessing.current = false;
          lastScannedCode.current = null;
        }, resultData?.success ? 1500 : 2500); // Keep error on screen longer

      } catch (err) {
        console.error("[QrScanner] Error:", err);
        playErrorBeep();
        setScanState("error");
        setScanMessage("Network error - request failed");
        
        setTimeout(() => {
          setScanState("idle");
          isProcessing.current = false;
          lastScannedCode.current = null;
        }, 2500);
      }
    },
    [onScan, eventName, onClose]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] h-[100dvh] w-full bg-black flex flex-col animate-in fade-in duration-100">
      {/* Header */}
      <div
        className="absolute top-0 inset-x-0 z-30 flex items-center justify-between gap-3 px-3 sm:px-5 md:px-8 pb-3 sm:pb-4 bg-gradient-to-b from-black/80 to-transparent"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-sm sm:text-base md:text-lg text-white truncate">
            {eventName || "Rapid Scanner"}
          </h2>
          <div className="flex items-center gap-1.5 text-[10px] md:text-xs text-emerald-400 font-semibold tracking-widest uppercase mt-0.5">
            <Activity size={12} strokeWidth={2} className={scanState === "idle" ? "animate-pulse" : ""} />{" "}
            {scanState === "idle" ? "Scanning" : "Paused"}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            onClick={toggleFlashlight}
            className={`h-11 w-11 sm:h-10 sm:w-10 md:h-12 md:w-12 flex items-center justify-center border backdrop-blur-md rounded-md text-white transition-colors ${
              flashlightOn
                ? "bg-yellow-400/30 border-yellow-400/50 text-yellow-300"
                : "bg-white/10 hover:bg-white/20 border-white/10"
            }`}
          >
            {flashlightOn ? <Zap size={20} strokeWidth={2} fill="currentColor" /> : <ZapOff size={20} strokeWidth={2} />}
          </button>
          <button
            onClick={onClose}
            className="h-11 w-11 sm:h-10 sm:w-10 md:h-12 md:w-12 flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/10 backdrop-blur-md rounded-md text-white transition-colors"
          >
            <X size={20} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Camera area */}
      <div className="flex-1 relative min-h-0">
        <Scanner
          onScan={handleScan}
          onError={() => {}}
          formats={["qr_code"]}
          scanDelay={400} // Increased slightly to prevent accidental double-reads
          allowMultiple={true}
          audio={false} // Force disable legacy version beeps
          components={{ audio: false, finder: false, onOff: false }} // Force disable modern version beeps
          styles={{
            container: { height: "100%" },
            video: { objectFit: "cover" },
          }}
          constraints={{ facingMode: "environment" }}
        />

        {/* FULL SCREEN OVERLAYS */}
        {scanState === "processing" && (
          <div className="absolute inset-0 z-20 bg-black/80 flex flex-col items-center justify-center text-white backdrop-blur-sm animate-in fade-in duration-100">
            <Loader2 className="w-14 h-14 animate-spin mb-4 text-blue-400" />
            <p className="text-xl font-bold">Verifying Pass...</p>
            <p className="text-sm text-gray-300 mt-2">Please ask candidate to wait</p>
          </div>
        )}

        {scanState === "success" && (
          <div className="absolute inset-0 z-20 bg-emerald-900/95 flex flex-col items-center justify-center text-white backdrop-blur-md animate-in fade-in zoom-in duration-200">
            <CheckCircle2 className="w-20 h-20 mb-4 text-emerald-400" />
            <p className="text-2xl font-bold text-center px-6">{scanMessage}</p>
          </div>
        )}

        {scanState === "error" && (
          <div className="absolute inset-0 z-20 bg-red-900/95 flex flex-col items-center justify-center text-white backdrop-blur-md animate-in fade-in zoom-in duration-200">
            <AlertOctagon className="w-20 h-20 mb-4 text-red-400" />
            <p className="text-2xl font-bold text-center px-6">{scanMessage}</p>
            {/* <div className="mt-6 px-4 py-2 bg-red-950/50 border border-red-500 rounded-lg text-red-200 font-bold uppercase tracking-widest text-sm">
              Do Not Let Pass
            </div> */}
          </div>
        )}

        {/* Finder frame (Hides automatically when an overlay is active) */}
        <div className={`absolute inset-0 flex flex-col items-center justify-center px-4 pointer-events-none transition-opacity duration-200 ${scanState !== "idle" ? "opacity-0" : "opacity-100"}`}>
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