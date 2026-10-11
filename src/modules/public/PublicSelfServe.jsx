import React, { useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { generateProjectQRPass } from "../../utils/EventQRPassGenerator";
import { Download, AlertTriangle, CheckCircle2, Phone } from "lucide-react";

export default function PublicSelfServe() {
  const { token } = useParams();
  const [mobile, setMobile] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleVerifyAndDownload = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    // Clean input to raw digits for comparison
    const rawMobile = mobile.replace(/\D/g, "");
    
    if (rawMobile.length < 10) {
      setError("Please enter a valid 10-digit mobile number.");
      setLoading(false);
      return;
    }

    try {
      // 1. Verify against the secure backend function
      const { data, error: rpcError } = await supabase.rpc("verify_public_attendee", { 
        p_token: token, 
        p_mobile: rawMobile 
      });

      if (rpcError) throw new Error(rpcError.message);
      
      if (!data || data.length === 0) {
        throw new Error("No matching registration found for this mobile number in this project.");
      }

      // 2. Generate and download the HD PDF Pass
      await generateProjectQRPass(data[0]);
      
      setSuccess(true);
      setMobile(""); // Clear form on success
    } catch (err) {
      console.error(err);
      setError(err.message || "An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F8FAFC] p-4 font-sans">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-sm border border-[#E2E8F0]">
        
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Download className="text-blue-600 w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-[#1E293B]">Get Your Event Pass</h2>
          <p className="text-[#64748B] mt-2 text-sm">
            Enter your registered mobile number to verify your identity and download your secure QR entry pass.
          </p>
        </div>
        
        {/* Status Messages */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex gap-3 text-left">
            <AlertTriangle className="text-red-500 w-5 h-5 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-100 rounded-xl flex gap-3 text-left">
            <CheckCircle2 className="text-green-500 w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-green-800">
              <strong className="block mb-1">Download Started!</strong>
              Your HD pass has been generated and saved to your device. You can close this page.
            </div>
          </div>
        )}
        
        {/* Verification Form */}
        <form onSubmit={handleVerifyAndDownload} className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-[#334155] mb-2">
              Registered Mobile Number
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Phone className="h-5 w-5 text-gray-400" />
              </div>
              <input 
                type="tel" 
                required 
                maxLength="15"
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-[#1E293B]" 
                placeholder="e.g., 9876543210"
                value={mobile} 
                onChange={e => setMobile(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading || !mobile}
            className="w-full flex justify-center items-center gap-2 bg-[#5C3030] text-white py-3.5 rounded-xl font-bold hover:bg-[#4a2626] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
          >
            {loading ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Verifying & Generating...
              </>
            ) : (
              "Download Pass"
            )}
          </button>
        </form>
      </div>
      
      <p className="mt-8 text-xs text-gray-400">
        Secure Pass System • Do not share your downloaded QR code
      </p>
    </div>
  );
}