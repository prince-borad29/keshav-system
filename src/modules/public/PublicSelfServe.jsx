import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import {
  Download,
  AlertTriangle,
  CheckCircle2,
  Phone,
  User,
} from "lucide-react";

const GENERIC_ERROR = "Something went wrong. Please try again in a moment.";

// "+91 98765 43210" / "098765-43210" -> "9876543210"
const normalizeMobile = (v) => {
  const digits = v.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
};

const userError = (msg) => Object.assign(new Error(msg), { userMessage: msg });

const triggerDownload = (url, filename) => {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
};

export default function PublicSelfServe() {

  const { token } = useParams();
  const [mobile, setMobile] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [matches, setMatches] = useState([]);
  const [pass, setPass] = useState(null); // { url, filename }
  const busy = useRef(false);

  // free the PDF blob when replaced or on unmount
  useEffect(
    () => () => {
      if (pass?.url) URL.revokeObjectURL(pass.url);
    },
    [pass],
  );

  const run = async (fn) => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      console.error(err);
      setError(err.userMessage || GENERIC_ERROR);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  };

  const generate = async (member) => {
    // loaded only when needed -> fast first paint on mobile data
    const { generateProjectQRPassBlob } =
      await import("../../utils/EventQRPassGenerator");
    const { blob, filename } = await generateProjectQRPassBlob(member);
    const url = URL.createObjectURL(blob);
    setPass({ url, filename });
    triggerDownload(url, filename);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const raw = normalizeMobile(mobile);
    if (raw.length !== 10) {
      setError("Please enter a valid 10-digit mobile number.");
      return;
    }

    run(async () => {
      setPass(null);
      setMatches([]);

      const { data, error: rpcError } = await supabase.rpc(
        "verify_public_attendee",
        {
          p_token: token,
          p_mobile: raw,
        },
      );
      if (rpcError) throw rpcError;

      if (!data?.length) {
        throw userError(
          "No registration found for this mobile number in this event.",
        );
      }

      if (data.length === 1) {
        await generate(data[0]);
        setMobile("");
      } else {
        setMatches(data); // several people share this number -> let them choose
      }
    });
  };

  const handlePick = (member) => run(() => generate(member));

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F8FAFC] p-4 font-sans">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-sm border border-[#E2E8F0]">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Download className="text-blue-600 w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-[#1E293B]">
            Get Your Event Pass
          </h2>
          <p className="text-[#64748B] mt-2 text-sm">
            Enter your registered mobile number to verify your identity and
            download your secure QR entry pass.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex gap-3 text-left"
          >
            <AlertTriangle className="text-red-500 w-5 h-5 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {pass && (
          <div
            role="status"
            className="mb-6 p-4 bg-green-50 border border-green-100 rounded-xl flex gap-3 text-left"
          >
            <CheckCircle2 className="text-green-500 w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-green-800">
              <strong className="block mb-1">Pass ready!</strong>
              If the download didn't start,{" "}
              <a
                href={pass.url}
                download={pass.filename}
                className="font-semibold underline"
              >
                tap here to download again
              </a>
              .
            </div>
          </div>
        )}

        {matches.length > 1 && (
          <div className="mb-6">
            <p className="text-sm font-semibold text-[#334155] mb-2">
              Multiple registrations found. Choose your pass:
            </p>
            <ul className="space-y-2">
              {matches.map((m) => (
                <li key={m.internal_code}>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => handlePick(m)}
                    className="w-full flex items-center gap-3 p-3 border border-gray-200 rounded-xl text-left hover:bg-gray-50 disabled:opacity-50"
                  >
                    <User className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    <span className="flex-1 text-[#1E293B] font-medium">
                      {m.member_name}
                    </span>
                    <span className="text-xs text-gray-500">
                      {m.internal_code}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          <div>
            <label
              htmlFor="mobile"
              className="block text-sm font-semibold text-[#334155] mb-2"
            >
              Registered Mobile Number
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Phone className="h-5 w-5 text-gray-400" />
              </div>
              <input
                id="mobile"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                required
                maxLength={15}
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-[#1E293B]"
                placeholder="e.g., 9876543210"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
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
                <svg
                  className="animate-spin -ml-1 mr-2 h-5 w-5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Verifying & Generating...
              </>
            ) : (
              "Download Pass"
            )}
          </button>
        </form>
      </div>

    </div>
  );
}
