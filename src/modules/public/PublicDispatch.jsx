import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { Phone, MessageCircle, AlertTriangle } from "lucide-react";

export default function PublicDispatch() {
  const { token } = useParams();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchMembers = async () => {
      const { data, error } = await supabase.rpc(
        "get_public_dispatch_members",
        { p_token: token },
      );
      if (error) setError(error.message);
      else setMembers(data);
      setLoading(false);
    };
    fetchMembers();
  }, [token]);

  const handleWhatsApp = (member) => {
    // 1. Construct the secure direct download link
    const downloadUrl = `${window.location.origin}/pass/${token}/${member.member_id}`;
    // 2. Prepare the Gujarati text with the link embedded
    const text = encodeURIComponent(
      `જય શ્રી સ્વામિનારાયણ ${member.member_name}, તમારા ${member.project_name} માટેના QR પાસને મેળવવા માટે નીચેની લિંક પર ક્લિક કરો:\n\n${downloadUrl}`,
    );

    // 3. Format Phone
    let phone = member.member_mobile?.replace(/\D/g, "") || "";
    if (phone.length === 10) phone = `91${phone}`;

    // 4. Open WhatsApp instantly
    window.open(`https://wa.me/${phone}?text=${text}`, "_blank");
  };

  if (loading)
    return (
      <div className="p-8 text-center text-[#5C3030]">Loading Data...</div>
    );
  if (error)
    return (
      <div className="p-8 text-center text-red-600 font-bold">
        <AlertTriangle className="mx-auto mb-2" />
        {error}
      </div>
    );

  return (
    <div className="max-w-md mx-auto p-6 bg-[#F8FAFC] min-h-screen font-sans">
      <h1 className="text-2xl font-bold text-[#5C3030] mb-1">
        {members[0]?.project_name || "Project Dispatch"}
      </h1>
      <p className="text-[15px] text-[#475569] mb-6">
        Total Eligible Members: {members.length}
      </p>

      <div className="space-y-4">
        {members.map((m) => (
          <div
            key={m.member_id}
            className="bg-white p-4 rounded-xl shadow-sm border border-[#E2E8F0] flex justify-between items-center"
          >
            <div>
              <p className="font-medium text-[#1E293B] text-[15px]">
                {m.member_name}
              </p>
              <p className="text-[13px] text-[#64748B] mt-0.5">
                {m.mandal_name} • {m.internal_code}
              </p>
            </div>
            <div className="flex gap-2">
              {m.member_mobile && (
                <>
                  <a
                    href={`tel:${m.member_mobile}`}
                    className="p-2.5 bg-gray-50 text-gray-500 rounded-lg hover:bg-gray-100 border border-gray-100"
                  >
                    <Phone size={18} strokeWidth={2} />
                  </a>
                  <button
                    onClick={() => handleWhatsApp(m)}
                    className="p-2.5 bg-[#F0FDF4] text-[#16A34A] rounded-lg hover:bg-[#DCFCE7] border border-[#DCFCE7]"
                  >
                    <MessageCircle size={18} strokeWidth={2.5} />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
