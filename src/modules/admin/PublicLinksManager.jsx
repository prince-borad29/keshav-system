import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Plus, Trash2, Copy, CheckCircle, Ban, Layers, ChevronDown, ChevronUp, UserCheck, Users } from 'lucide-react';
import toast from 'react-hot-toast';

export default function PublicLinksManager() {
  const { profile } = useAuth();
  const [links, setLinks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [kshetras, setKshetras] = useState([]);
  const [mandals, setMandals] = useState([]);
  const [loading, setLoading] = useState(true);

  const [isCreating, setIsCreating] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [linkType, setLinkType] = useState('DISPATCH'); // 'DISPATCH' or 'ATTENDEE_SELF_SERVE'
  const [expiresAt, setExpiresAt] = useState('');
  
  const [expandedProjects, setExpandedProjects] = useState({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [projectsRes, kshetrasRes, mandalsRes, linksRes] = await Promise.all([
      supabase.from('projects').select('id, name, created_at').eq('is_active', true).order('created_at', { ascending: false }),
      supabase.from('kshetras').select('id, name'),
      supabase.from('mandals').select('id, name, kshetra_id'),
      supabase.from('public_broadcast_links').select(`*, projects:project_id(name)`).order('created_at', { ascending: false })
    ]);

    if (projectsRes.data) setProjects(projectsRes.data);
    if (kshetrasRes.data) setKshetras(kshetrasRes.data);
    if (mandalsRes.data) setMandals(mandalsRes.data);
    if (linksRes.data) {
      setLinks(linksRes.data);
      if (linksRes.data.length > 0) {
        const firstProjectId = linksRes.data[0].project_id;
        setExpandedProjects({ [firstProjectId]: true });
      }
    }
    setLoading(false);
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!selectedProjectId) return toast.error("Please select a project.");
    
    const projectName = projects.find(p => p.id === selectedProjectId)?.name;
    const expiry = expiresAt ? new Date(expiresAt).toISOString() : null;
    let payloads = [];

    if (linkType === 'ATTENDEE_SELF_SERVE') {
      // Create just ONE global link for Self-Serve
      payloads.push({
        title: `${projectName} - Attendee Self-Serve`,
        project_id: selectedProjectId,
        link_type: 'ATTENDEE_SELF_SERVE',
        created_by: profile.id,
        is_active: true, expires_at: expiry, target_kshetra_id: null, target_mandal_id: null,
      });
    } else {
      // Bulk generate scoped links for Volunteer Dispatch
      payloads.push({
        title: `${projectName} - Global Dispatch`, project_id: selectedProjectId, link_type: 'DISPATCH',
        created_by: profile.id, is_active: true, expires_at: expiry, target_kshetra_id: null, target_mandal_id: null,
      });

      kshetras.forEach(k => {
        payloads.push({
          title: `${projectName} - ${k.name} (Kshetra)`, project_id: selectedProjectId, link_type: 'DISPATCH',
          created_by: profile.id, is_active: true, expires_at: expiry, target_kshetra_id: k.id, target_mandal_id: null,
        });
      });

      mandals.forEach(m => {
        payloads.push({
          title: `${projectName} - ${m.name} (Mandal)`, project_id: selectedProjectId, link_type: 'DISPATCH',
          created_by: profile.id, is_active: true, expires_at: expiry, target_kshetra_id: null, target_mandal_id: m.id,
        });
      });
    }

    const { error } = await supabase.from('public_broadcast_links').insert(payloads);
    if (error) toast.error(error.message);
    else {
      toast.success(linkType === 'ATTENDEE_SELF_SERVE' ? 'Self-Serve link generated!' : `Generated ${payloads.length} scoped dispatch links!`);
      setIsCreating(false);
      setExpandedProjects(prev => ({ ...prev, [selectedProjectId]: true }));
      fetchData();
    }
  };

  const handleRevoke = async (id) => {
    if (!window.confirm("Are you sure you want to revoke this link?")) return;
    await supabase.from('public_broadcast_links').update({ is_active: false }).eq('id', id);
    fetchData();
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Permanently delete this link record?")) return;
    await supabase.from('public_broadcast_links').delete().eq('id', id);
    fetchData();
  };

  const copyToClipboard = (token, type) => {
    // Generate correct URL based on link type
    const path = type === 'ATTENDEE_SELF_SERVE' ? `/public/qr-pass/${token}` : `/public/dispatch/${token}`;
    navigator.clipboard.writeText(`${window.location.origin}${path}`);
    toast.success(`${type === 'ATTENDEE_SELF_SERVE' ? 'Self-Serve' : 'Dispatch'} Link copied!`);
  };

  const toggleProjectCard = (projectId) => {
    setExpandedProjects(prev => ({ ...prev, [projectId]: !prev[projectId] }));
  };

  const groupedLinks = links.reduce((acc, link) => {
    const pId = link.project_id;
    if (!acc[pId]) acc[pId] = { projectName: link.projects?.name || 'Unknown Project', links: [] };
    acc[pId].links.push(link);
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Project QR Links</h1>
          <p className="text-sm text-gray-500 mt-1">Manage public dispatch and self-serve links.</p>
        </div>
        <button onClick={() => setIsCreating(!isCreating)} className="flex items-center gap-2 bg-[#5C3030] text-white px-4 py-2 rounded-md hover:bg-[#4a2626] transition-colors">
          {isCreating ? <Ban size={16} /> : <Plus size={16} />}
          {isCreating ? 'Cancel' : 'Create New Links'}
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleGenerate} className="bg-white p-5 rounded-xl border shadow-sm space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Target Project *</label>
              <select required className="w-full border p-2.5 rounded-md text-sm bg-white" value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)}>
                <option value="">-- Select Project --</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Link Purpose *</label>
              <select className="w-full border p-2.5 rounded-md text-sm bg-white" value={linkType} onChange={e => setLinkType(e.target.value)}>
                <option value="DISPATCH">Volunteer Dispatch (Bulk Scoped Links)</option>
                <option value="ATTENDEE_SELF_SERVE">Attendee Self-Serve (1 Global Link)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Expiry Date & Time (Optional)</label>
              <input type="datetime-local" className="w-full border p-2.5 rounded-md text-sm" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} />
            </div>
          </div>
          
          <div className={`p-3 rounded-lg text-sm border ${linkType === 'ATTENDEE_SELF_SERVE' ? 'bg-indigo-50 text-indigo-800 border-indigo-100' : 'bg-blue-50 text-blue-800 border-blue-100'}`}>
            {linkType === 'ATTENDEE_SELF_SERVE' 
              ? <span><strong className="flex items-center gap-1.5 mb-1"><UserCheck size={16}/> Attendee Self-Serve:</strong> This will generate <strong>1 Global Link</strong>. Attendees will open this link and enter their mobile number to download their pass.</span>
              : <span><strong className="flex items-center gap-1.5 mb-1"><Users size={16}/> Volunteer Dispatch:</strong> This will bulk-generate <strong>{1 + kshetras.length + mandals.length} Links</strong> (Global, Kshetras, Mandals). You can distribute these specific links to your Mandal leaders.</span>}
          </div>

          <div className="flex justify-end pt-3 border-t mt-4">
            <button type="submit" className="bg-green-600 text-white px-6 py-2.5 rounded-md font-semibold text-sm hover:bg-green-700 transition-colors">
              {linkType === 'ATTENDEE_SELF_SERVE' ? 'Generate Self-Serve Link' : 'Bulk Generate Dispatch Links'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-center py-10 text-gray-500">Loading links...</div>
      ) : Object.keys(groupedLinks).length === 0 ? (
        <div className="bg-white p-10 rounded-xl border text-center text-gray-500 shadow-sm">
          <Layers className="w-12 h-12 mx-auto text-gray-300 mb-3" />
          <p className="text-lg font-medium text-gray-700">No public links generated yet.</p>
          <p className="text-sm mt-1">Click "Create New Links" above to create links for a project.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedLinks).map(([projectId, group]) => {
            const isExpanded = expandedProjects[projectId];
            const activeCount = group.links.filter(l => l.is_active && (!l.expires_at || new Date(l.expires_at) > new Date())).length;

            return (
              <div key={projectId} className="bg-white rounded-xl border shadow-sm overflow-hidden transition-all">
                <button onClick={() => toggleProjectCard(projectId)} className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 border-b border-transparent">
                  <div className="flex items-center gap-4">
                    <h2 className="font-bold text-gray-900 text-lg text-left">{group.projectName}</h2>
                    <div className="flex gap-2">
                      <span className="px-2.5 py-1 bg-gray-200 text-gray-700 text-xs font-semibold rounded-full">{group.links.length} Total</span>
                      <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${activeCount > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{activeCount} Active</span>
                    </div>
                  </div>
                  <div className="p-1 rounded-full hover:bg-gray-200">
                    {isExpanded ? <ChevronUp size={20} className="text-gray-600" /> : <ChevronDown size={20} className="text-gray-600" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="overflow-x-auto border-t">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-white text-gray-500 text-xs uppercase border-b">
                          <th className="p-4 font-semibold w-24">Status</th>
                          <th className="p-4 font-semibold">Purpose & Scope</th>
                          <th className="p-4 font-semibold">Expiry</th>
                          <th className="p-4 font-semibold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 text-sm">
                        {group.links.map(link => {
                          const isExpired = link.expires_at && new Date(link.expires_at) < new Date();
                          const isValid = link.is_active && !isExpired;
                          const isSelfServe = link.link_type === 'ATTENDEE_SELF_SERVE';
                          
                          return (
                            <tr key={link.id} className="hover:bg-gray-50">
                              <td className="p-4">
                                {isValid ? <span className="inline-flex text-[11px] font-bold text-green-700 bg-green-100 px-2 py-1 rounded-md">ACTIVE</span>
                                : <span className="inline-flex text-[11px] font-bold text-red-700 bg-red-100 px-2 py-1 rounded-md">{isExpired ? 'EXPIRED' : 'REVOKED'}</span>}
                              </td>
                              <td className="p-4">
                                <div className="flex items-center gap-2">
                                  {isSelfServe ? <UserCheck size={16} className="text-indigo-500" /> : <Users size={16} className="text-blue-500" />}
                                  <span className="font-semibold text-gray-900">{link.title}</span>
                                </div>
                                <span className="text-xs text-gray-500 mt-0.5 ml-6 inline-block">
                                  {isSelfServe ? 'Public Mobile Verification' : (link.target_mandal_id ? 'Mandal Level Dispatch' : link.target_kshetra_id ? 'Kshetra Level Dispatch' : 'Global Level Dispatch')}
                                </span>
                              </td>
                              <td className="p-4 text-xs text-gray-600">
                                {link.expires_at ? new Date(link.expires_at).toLocaleString() : 'Never'}
                              </td>
                              <td className="p-4 flex justify-end gap-2">
                                <button onClick={() => copyToClipboard(link.access_token, link.link_type)} disabled={!isValid} className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg disabled:opacity-50 transition-colors" title={`Copy ${isSelfServe ? 'Self-Serve' : 'Dispatch'} Link`}>
                                  <Copy size={16} />
                                </button>
                                {isValid && (
                                  <button onClick={() => handleRevoke(link.id)} className="p-2 bg-amber-50 text-amber-600 hover:bg-amber-100 rounded-lg transition-colors" title="Revoke Link">
                                    <Ban size={16} />
                                  </button>
                                )}
                                <button onClick={() => handleDelete(link.id)} className="p-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors" title="Delete permanently">
                                  <Trash2 size={16} />
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  );
}