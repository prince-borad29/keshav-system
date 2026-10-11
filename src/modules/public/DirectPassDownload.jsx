import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { generateProjectQRPass } from "../../utils/EventQRPassGenerator";
import { CheckCircle2, Loader2, AlertTriangle } from "lucide-react";


export default function DirectPassDownload() {

  const { token, memberId } = useParams();
  const [status, setStatus] = useState("downloading"); // 'downloading', 'success', 'error'

  useEffect(() => {
    const triggerDownload = async () => {
      try {
        const { data, error } = await supabase.rpc("get_direct_pass_data", {
          p_token: token,
          p_member_id: memberId,
        });

        if (error || !data || data.length === 0)
          throw new Error("Invalid or expired pass link.");

        // Generates the image invisibly in the background and downloads it
        await generateProjectQRPass(data[0]);

        setStatus("success");
      } catch (err) {
        console.error(err);
        setStatus("error");
      }
    };

    triggerDownload();
  }, [token, memberId]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6 text-center font-sans">
      {status === "downloading" && (
        <>
          <Loader2 className="w-12 h-12 text-[#5C3030] animate-spin mb-4" />
          <h2 className="text-xl font-bold text-[#1E293B]">
            Generating your Pass...
          </h2>
          <p className="text-[#64748B] mt-2">
            Please wait, your image is downloading automatically.
          </p>
        </>
      )}

      {status === "success" && (
        <>
          <CheckCircle2 className="w-16 h-16 text-green-500 mb-4" />
          <h2 className="text-2xl font-bold text-[#1E293B]">
            Download Complete!
          </h2>
          <p className="text-[#64748B] mt-2">
            You can now close this window and check your gallery/downloads.
          </p>
        </>
      )}

      {status === "error" && (
        <>
          <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-[#1E293B]">Link Invalid</h2>
          <p className="text-[#64748B] mt-2">
            This pass could not be generated. Please contact your volunteer.
          </p>
        </>
      )}
    </div>
  );
}
