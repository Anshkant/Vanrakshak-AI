"use client";

import { Navigation } from "@/components/Navigation";
import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import Link from 'next/link';
import { createCamera, updateCamera, deleteCamera, toggleCameraStatus } from "@/app/actions/admin";

export default function SettingsPage() {
  const [profile, setProfile] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'profile' | 'cameras'>('profile');
  
  // Profile Form states
  const [fullName, setFullName] = useState("");
  const [chatId, setChatId] = useState("");
  
  // Camera states
  const [cameras, setCameras] = useState<any[]>([]);
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [editingCamera, setEditingCamera] = useState<any>(null);
  
  const supabase = createClient();
  const router = useRouter();

  const isSuperAdmin = profile?.role === 'super_admin';

  useEffect(() => {
    const getProfile = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        router.push("/login");
        return;
      }

      setUser(session.user);

      if (session.user?.id) {
        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single();

        if (error) {
          setDbError(error.message);
        }

        if (data) {
          setProfile(data);
          setFullName(data.full_name || "");
          setChatId(data.chat_id || "");
        }
      }
      setLoading(false);
    };

    getProfile();
  }, [supabase, router]);

  useEffect(() => {
    if (activeTab === 'cameras' && profile?.zone_id) {
      fetchCameras();
    }
  }, [activeTab, profile]);

  const fetchCameras = async () => {
    const { data, error } = await supabase
      .from("cameras")
      .select("*")
      .order('created_at', { ascending: false });
    
    if (error) {
       console.error("Camera Fetch Error:", error);
       setDbError(error.message);
    }
    
    if (data) {
      setCameras(data);
      if (data.length > 0) setDbError(null); // Clear error if we have data
    }
  };

  const handleSaveProfile = async () => {
    if (!user?.id) {
      setMessage({ type: 'error', text: "User session not found. Please log in again." });
      return;
    }

    setSaving(true);
    setMessage(null);

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        chat_id: chatId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      setMessage({ type: 'success', text: "Profile updated successfully!" });
      router.refresh();
    }
    setSaving(false);
  };

  const handleCameraAction = async (formData: FormData) => {
    setSaving(true);
    let result;
    if (editingCamera) {
      result = await updateCamera(editingCamera.id, formData);
    } else {
      result = await createCamera(formData);
    }
    
    setSaving(false);
    if (result.error) {
       const errorText = typeof result.error === 'string' ? result.error : JSON.stringify(result.error);
       setMessage({ type: 'error', text: errorText });
    } else {
      setMessage({ type: 'success', text: result.success || 'Success' });
      setIsCameraModalOpen(false);
      setEditingCamera(null);
      fetchCameras();
    }
  };

  const handleDeleteCamera = async (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to delete camera ${name}?`)) {
      const result = await deleteCamera(id);
      if (result.success) {
        setMessage({ type: 'success', text: result.success });
        fetchCameras();
      } else {
        setMessage({ type: 'error', text: result.error as string });
      }
    }
  };

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const handleTogglePower = async (id: string, currentStatus: string) => {
    setTogglingId(id);
    const result = await toggleCameraStatus(id, currentStatus);
    setTogglingId(null);
    
    if (result.success) {
      setMessage({ type: 'success', text: result.success });
      fetchCameras();
    } else {
      setMessage({ type: 'error', text: result.error as string });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <span className="material-symbols-outlined animate-spin text-primary text-4xl">refresh</span>
      </div>
    );
  }

  return (
    <div className="bg-background-light dark:bg-[#0a141c] font-display text-slate-900 dark:text-slate-100 transition-colors duration-200 min-h-screen">
      <Navigation />

      <main className="flex-1 px-4 sm:px-6 md:px-10 lg:px-16 xl:px-24 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-6 md:mb-8 flex justify-between items-end">
            <div>
              <h1 className="text-slate-900 dark:text-white text-2xl md:text-3xl lg:text-4xl font-black tracking-tight mb-2">Settings</h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm md:text-base">Manage your conservation network and surveillance grid.</p>
            </div>
            {activeTab === 'cameras' && isSuperAdmin && (
              <button 
                onClick={() => {
                  setEditingCamera(null);
                  setIsCameraModalOpen(true);
                }}
                className="bg-primary text-white px-6 py-2.5 rounded-xl font-black text-sm shadow-xl shadow-primary/20 hover:brightness-110 active:scale-95 transition-all flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-lg">add_a_photo</span>
                ADD CAMERA
              </button>
            )}
          </div>

          {/* Success/Error Message */}
          {message && (
            <div className={`mb-6 p-4 rounded-xl border flex items-center gap-3 font-bold text-sm animate-in slide-in-from-top-2 ${
              message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-red-500/10 border-red-500/20 text-red-500'
            }`}>
              <span className="material-symbols-outlined">{message.type === 'success' ? 'check_circle' : 'error'}</span>
              {message.text}
              <button onClick={() => setMessage(null)} className="ml-auto opacity-50 hover:opacity-100 italic text-[10px]">DISMISS</button>
            </div>
          )}

          {/* Tabbed Navigation */}
          <div className="mb-8 border-b border-slate-200 dark:border-slate-800">
            <div className="flex gap-4 md:gap-6 overflow-x-auto no-scrollbar">
              <button 
                onClick={() => setActiveTab('profile')}
                className={`pb-3 font-bold text-sm whitespace-nowrap transition-all border-b-2 ${
                  activeTab === 'profile' ? 'text-primary border-primary' : 'text-slate-500 border-transparent hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                User Profile
              </button>
              <button 
                onClick={() => setActiveTab('cameras')}
                className={`pb-3 font-bold text-sm whitespace-nowrap transition-all border-b-2 ${
                  activeTab === 'cameras' ? 'text-primary border-primary' : 'text-slate-500 border-transparent hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                Camera Network
              </button>
              <button className="pb-3 text-slate-500 font-semibold text-sm whitespace-nowrap opacity-50 cursor-not-allowed">Alerts &amp; AI</button>
              <button className="pb-3 text-slate-500 font-semibold text-sm whitespace-nowrap opacity-50 cursor-not-allowed">Notifications</button>
            </div>
          </div>

          {activeTab === 'profile' ? (
            <div className="space-y-6">
              {/* Profile Section */}
              <section className="bg-white dark:bg-slate-900 rounded-xl p-5 md:p-8 shadow-sm border border-slate-100 dark:border-slate-800">
                <h3 className="text-lg md:text-xl font-bold mb-5 flex items-center gap-2 text-primary">
                  <span className="material-symbols-outlined">person</span>
                  Profile Information
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Full Name</label>
                    <input 
                      className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 h-12 px-4 focus:ring-2 focus:ring-primary outline-none text-sm font-medium transition-all" 
                      type="text" 
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Email Address</label>
                    <input 
                      disabled
                      className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 h-12 px-4 outline-none text-sm font-medium text-slate-500 cursor-not-allowed" 
                      type="email" 
                      value={user?.email || ""} 
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Role</label>
                    <div className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 h-12 px-4 flex items-center text-sm font-bold text-slate-500 capitalize">
                      {profile?.role?.replace('_', ' ') || 'Personnel'}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Telegram Chat ID</label>
                    <input 
                      className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 h-12 px-4 focus:ring-2 focus:ring-primary outline-none text-sm font-medium transition-all" 
                      type="text" 
                      value={chatId}
                      onChange={(e) => setChatId(e.target.value)}
                      placeholder="Not Set"
                    />
                  </div>
                </div>

                {/* Diagnostic/Error Section */}
                {(dbError || user?.id) && (
                  <div className="mt-8 pt-8 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {user?.id && (
                      <div className="flex flex-col gap-2 p-4 bg-rose-500/5 rounded-2xl border border-rose-500/10">
                        <label className="text-[10px] font-black text-rose-500 uppercase tracking-widest ml-1">Diagnostic: Account ID</label>
                        <div className="bg-white dark:bg-slate-900 border border-rose-500/10 rounded-lg p-2 font-mono text-[9px] text-rose-500 break-all select-all">
                          {user.id}
                        </div>
                      </div>
                    )}
                    {dbError && (
                      <div className="flex flex-col gap-2 p-4 bg-amber-500/5 rounded-2xl border border-amber-500/10">
                        <label className="text-[10px] font-black text-amber-500 uppercase tracking-widest ml-1">Database Sync Error</label>
                        <div className="bg-white dark:bg-slate-900 border border-amber-500/10 rounded-lg p-2 font-mono text-[9px] text-amber-600 truncate">
                          {dbError}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* Region/Zone Info */}
              <section className="bg-white dark:bg-slate-900 rounded-xl p-5 md:p-8 shadow-sm border border-slate-100 dark:border-slate-800">
                <h3 className="text-lg md:text-xl font-bold mb-5 flex items-center gap-2 text-primary">
                  <span className="material-symbols-outlined">map</span>
                  Deployment Region
                </h3>
                <div className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800/30 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <div className="size-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-black text-xl">
                    {profile?.zone_id || 'Z'}
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Active Sector</p>
                    <p className="text-sm font-bold capitalize">Zone {profile?.zone_id || 'Global Coverage'}</p>
                  </div>
                </div>
              </section>

              {/* Action Buttons */}
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pb-24 md:pb-10">
                <button onClick={() => router.back()} className="w-full sm:w-auto px-8 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 font-bold text-sm">Cancel</button>
                <button 
                  disabled={saving}
                  onClick={handleSaveProfile}
                  className="w-full sm:w-auto px-8 py-3 rounded-2xl bg-primary text-white font-black shadow-xl shadow-primary/10 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving ? <span className="material-symbols-outlined animate-spin text-lg">refresh</span> : <span className="material-symbols-outlined text-lg">save</span>}
                  SAVE SETTINGS
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Camera List Section */}
              <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                   <table className="w-full text-left">
                     <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                        <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                          <th className="px-6 py-4">Camera Identifier</th>
                          <th className="px-6 py-4">Location &amp; Zone</th>
                          <th className="px-6 py-4">Status</th>
                          <th className="px-6 py-4">Feed Link</th>
                          <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                        {cameras.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-6 py-12 text-center text-slate-400 text-sm font-medium italic">
                               No cameras registered in this sector.
                            </td>
                          </tr>
                        ) : (
                          cameras.map(camera => (
                            <tr key={camera.id} className="group hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-all">
                               <td className="px-6 py-5">
                                 <div className="flex items-center gap-3">
                                   <div className={`size-8 rounded-lg flex items-center justify-center text-white font-black text-xs ${camera.status === 'online' ? 'bg-emerald-500' : 'bg-slate-400'}`}>
                                      {camera.name.substring(0,2).toUpperCase()}
                                   </div>
                                   <p className="font-bold text-sm">{camera.name}</p>
                                 </div>
                               </td>
                               <td className="px-6 py-5">
                                 <p className="text-sm font-bold">{camera.location}</p>
                                 <p className="text-[10px] font-black text-primary uppercase">Zone {camera.zone_id}</p>
                               </td>
                               <td className="px-6 py-5">
                                 <div className="flex items-center gap-3">
                                   <div className={`size-2 rounded-full ${camera.status === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></div>
                                   <span className="text-[10px] font-black uppercase tracking-tighter">{camera.status}</span>
                                   
                                   {isSuperAdmin && (
                                     <button 
                                       disabled={togglingId === camera.id}
                                       onClick={() => handleTogglePower(camera.id, camera.status)}
                                       className={`ml-1 size-7 rounded-lg flex items-center justify-center transition-all ${
                                         camera.status === 'online' 
                                           ? 'bg-rose-500/10 text-rose-500 hover:bg-rose-500/20' 
                                           : 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20'
                                       }`}
                                     >
                                       {togglingId === camera.id ? (
                                         <span className="material-symbols-outlined text-sm animate-spin">refresh</span>
                                       ) : (
                                         <span className="material-symbols-outlined text-sm">power_settings_new</span>
                                       )}
                                     </button>
                                   )}
                                 </div>
                               </td>
                               <td className="px-6 py-5">
                                 <a href={camera.feed_url} target="_blank" className="text-primary hover:underline text-xs font-bold truncate max-w-[150px] inline-block">
                                    {camera.feed_url}
                                 </a>
                               </td>
                               <td className="px-6 py-5 text-right">
                                  {isSuperAdmin && (
                                    <div className="flex items-center justify-end gap-2">
                                       <button 
                                          onClick={() => {
                                            setEditingCamera(camera);
                                            setIsCameraModalOpen(true);
                                          }}
                                          className="p-2 rounded-lg text-slate-400 hover:text-primary hover:bg-primary/10 transition-all"
                                       >
                                         <span className="material-symbols-outlined text-lg">edit</span>
                                       </button>
                                       <button 
                                          onClick={() => handleDeleteCamera(camera.id, camera.name)}
                                          className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                                       >
                                         <span className="material-symbols-outlined text-lg">delete</span>
                                       </button>
                                    </div>
                                  )}
                               </td>
                            </tr>
                          ))
                        )}
                     </tbody>
                   </table>
                </div>
              </section>
            </div>
          )}
        </div>
      </main>

      {/* Camera Modal */}
      {isCameraModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setIsCameraModalOpen(false)}></div>
           <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-[2rem] p-8 border border-white/10 shadow-2xl overflow-hidden scale-in-center">
              <div className="absolute top-0 left-0 w-full h-1 bg-primary"></div>
              <h3 className="text-2xl font-black mb-1 uppercase tracking-tight italic">
                {editingCamera ? 'Modify Camera' : 'Register Camera'}
              </h3>
              <p className="text-xs text-slate-500 font-bold mb-6">CONFIGURE SENTINEL WATCH-POINT</p>

              <form action={handleCameraAction} className="space-y-4">
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5 col-span-2">
                      <label className="text-[10px] font-black uppercase text-slate-500 ml-1">Camera Name/ID</label>
                      <input name="name" defaultValue={editingCamera?.name} required placeholder="SENTINEL-01" className="w-full h-12 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 text-sm font-bold focus:ring-2 focus:ring-primary outline-none" />
                    </div>
                    <div className="space-y-1.5 col-span-2">
                      <label className="text-[10px] font-black uppercase text-slate-500 ml-1">Installation Location</label>
                      <input name="location" defaultValue={editingCamera?.location} required placeholder="Eastern Gorge Pass" className="w-full h-12 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 text-sm font-bold focus:ring-2 focus:ring-primary outline-none" />
                    </div>
                    <div className="space-y-1.5 col-span-2">
                      <label className="text-[10px] font-black uppercase text-slate-500 ml-1">Video Feed URL (Camera Link)</label>
                      <input name="feed_url" defaultValue={editingCamera?.feed_url} required type="url" placeholder="https://youtube.com/live/..." className="w-full h-12 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 text-sm font-bold focus:ring-2 focus:ring-primary outline-none" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase text-slate-500 ml-1">Zone ID</label>
                      <input name="zone_id" defaultValue={editingCamera?.zone_id || profile?.zone_id} required placeholder="Z-01" className="w-full h-12 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 text-sm font-bold focus:ring-2 focus:ring-primary outline-none" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase text-slate-500 ml-1">Current Status</label>
                      <select name="status" defaultValue={editingCamera?.status || 'online'} className="w-full h-12 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 text-sm font-bold focus:ring-2 focus:ring-primary outline-none cursor-pointer">
                        <option value="online">Online</option>
                        <option value="offline">Offline</option>
                        <option value="maintenance">Maintenance</option>
                      </select>
                    </div>
                 </div>

                 <div className="flex gap-3 pt-6">
                    <button type="button" onClick={() => setIsCameraModalOpen(false)} className="flex-1 px-6 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 font-bold text-sm">Abort</button>
                    <button 
                      disabled={saving}
                      type="submit" 
                      className="flex-[2] bg-primary text-white px-6 py-3 rounded-2xl font-black text-sm shadow-xl shadow-primary/20 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
                    >
                      {saving ? 'PROCESSING...' : (editingCamera ? 'UPDATE SENTINEL' : 'FINALIZE REGISTRY')}
                    </button>
                 </div>
              </form>
           </div>
        </div>
      )}

      <footer className="mt-12 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0a141c] py-8 pb-32 md:pb-10">
        <div className="max-w-4xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4 text-center text-slate-500">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-lg">forest</span>
            <p className="text-sm font-medium">© 2026 VanRakshak AI Surveillance System.</p>
          </div>
          <div className="flex gap-6">
            <Link className="text-[10px] font-black hover:text-primary uppercase tracking-widest" href="#">Support</Link>
            <Link className="text-[10px] font-black hover:text-primary uppercase tracking-widest" href="#">API</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
