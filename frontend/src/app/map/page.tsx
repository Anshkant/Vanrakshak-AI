import { Navigation } from "@/components/Navigation";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import Link from 'next/link'
import { MapClient } from "@/components/MapClient";

export default async function FullMapPage() {
  const supabase = await createClient();
  
  // 1. Fetch User & Profile
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  const zoneId = profile?.zone_id || 'Z-01';

  // 2. Fetch All Entities for the map
  const { data: alerts } = await supabase
    .from('alerts')
    .select('*')
    .eq('zone_id', zoneId)
    .eq('status', 'unresolved'); // Only show active threats

  const { data: cameras } = await supabase
    .from('cameras')
    .select('*')
    .eq('zone_id', zoneId);

  return (
    <div className="flex h-screen w-full flex-col bg-[#0a141c]">
      <Navigation />
      
      <main className="flex-1 relative overflow-hidden">
        <div className="absolute inset-0 scanline z-[400] pointer-events-none opacity-40"></div>
        <MapClient 
          cameras={cameras || []} 
          alerts={alerts || []} 
          zoom={14}
        />
        
        {/* Map Legend HUD */}
        <div className="absolute top-6 right-6 z-[500] p-5 hud-card !bg-slate-900/60 !border-white/5 pointer-events-none">
          <h3 className="text-white text-[10px] font-black uppercase tracking-widest mb-4 opacity-70">Tactical Legend</h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="size-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
              <span className="text-white text-[10px] font-bold uppercase">Online Camera</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="size-2 rounded-full bg-slate-500"></div>
              <span className="text-white text-[10px] font-bold uppercase">Offline Unit</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="size-3 rounded-full bg-red-500 animate-pulse-slow"></div>
              <span className="text-white text-[10px] font-bold uppercase">Active Intrusion</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
