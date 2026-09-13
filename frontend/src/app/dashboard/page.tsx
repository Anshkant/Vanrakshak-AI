import { Navigation } from "@/components/Navigation";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import Link from 'next/link'
import { MapClient } from "@/components/MapClient";

export default async function DashboardPage() {
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

  // 2. Fetch Active Alerts (Latest 3 unresolved)
  const { data: alerts } = await supabase
    .from('alerts')
    .select('*')
    .eq('zone_id', zoneId)
    .neq('status', 'resolved')
    .order('created_at', { ascending: false })
    .limit(3);

  // 3. Fetch All Entities for the map (Mini version still needs coordinates)
  const { data: allAlerts } = await supabase
    .from('alerts')
    .select('*')
    .eq('zone_id', zoneId)
    .neq('status', 'resolved');

  const { data: cameras } = await supabase
    .from('cameras')
    .select('*')
    .eq('zone_id', zoneId);

  // 4. Calculate Stats (Simplified Logic)
  const criticalAlerts = alerts?.filter(a => a.severity?.toLowerCase() === 'critical').length || 0;
  const poachingRisk = Math.min(Math.round((criticalAlerts / 3) * 100), 100) || 12; // Fallback to 12% if none

  return (
    <div className="font-display bg-background-light dark:bg-[#0a141c] text-slate-900 dark:text-slate-100 min-h-screen flex flex-col leading-relaxed">
      {/* Top Navigation Bar */}
      <Navigation />

      <main className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-6 md:py-8 space-y-6 md:space-y-8 flex-1 w-full">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <p className="text-primary font-semibold text-sm uppercase tracking-wider">Dashboard Overview</p>
            <h2 className="text-3xl font-bold">{profile?.full_name ? `${profile.full_name}'s Sentinel Console` : 'Vibrant Sanctuary Monitor'}</h2>
            <p className="text-slate-500 text-sm mt-1">Assigned Zone: <span className="font-bold text-slate-700 dark:text-slate-300">{zoneId}</span></p>
          </div>
          <div className="flex gap-2">
            <div className="bg-emerald-500/10 text-emerald-600 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">check_circle</span> SYSTEM HEALTH: EXCELLENT
            </div>
            <div className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">cloud_sync</span> LIVE SYNC
            </div>
          </div>
        </div>

        {/* Risk Zone Stats - 2x2 on mobile */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 animate-fade-in">
          <div className="hud-card p-5 group hover:border-red-500/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest">Poaching Risk</span>
              <span className="material-symbols-outlined text-red-500 text-lg">dangerous</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">{poachingRisk}%</span>
              <span className="text-emerald-500 text-xs font-bold">↓ {Math.max(0, 4 - criticalAlerts)}%</span>
            </div>
            <div className="mt-3 w-full bg-slate-100 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
              <div className="bg-red-500 h-full" style={{ width: `${poachingRisk}%` }}></div>
            </div>
          </div>
          <div className="hud-card p-5 group hover:border-primary/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest">Animal Activity</span>
              <span className="material-symbols-outlined text-primary text-lg">pets</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">High</span>
              <span className="text-primary text-xs font-bold">↑ 18%</span>
            </div>
            <div className="mt-3 w-full bg-slate-100 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
              <div className="bg-primary h-full w-[85%]"></div>
            </div>
          </div>
          <div className="hud-card p-5 group hover:border-blue-500/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest">Humidity Index</span>
              <span className="material-symbols-outlined text-blue-500 text-lg">water_drop</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">78%</span>
              <span className="text-slate-400 text-xs">Optimal</span>
            </div>
            <div className="mt-3 w-full bg-slate-100 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
              <div className="bg-blue-500 h-full w-[78%]"></div>
            </div>
          </div>
          <div className="hud-card p-5 group hover:border-orange-500/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest">Forest Fire Index</span>
              <span className="material-symbols-outlined text-orange-500 text-lg">local_fire_department</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">Low</span>
              <span className="text-emerald-500 text-xs font-bold">Stable</span>
            </div>
            <div className="mt-3 w-full bg-slate-100 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
              <div className="bg-orange-500 h-full w-[15%]"></div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
          {/* 2x2 Camera Feed Grid */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">videocam</span> Live Monitoring
              </h3>
              <button className="text-primary text-sm font-semibold hover:underline">Full Screen</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              {cameras?.length ? cameras.map((cam) => (
                <div key={cam.id} className="group relative aspect-video bg-slate-200 dark:bg-slate-800 rounded-xl overflow-hidden border border-primary/10 shadow-lg">
                 <img
  className="w-full h-full object-cover opacity-90 group-hover:scale-105 transition-transform duration-700"
  src={cam.feed_url || "https://images.unsplash.com/photo-1448375240586-882707db888b?q=80&w=640&auto=format"}
  onError={(e) => {
    e.currentTarget.src =
      "https://images.unsplash.com/photo-1448375240586-882707db888b?q=80&w=640&auto=format";
  }}
  alt={cam.name}
/>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>
                  <div className={`absolute top-3 left-3 ${cam.status === 'online' ? 'bg-red-600' : 'bg-slate-500'} text-white text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1`}>
                    <span className={`w-1.5 h-1.5 ${cam.status === 'online' ? 'bg-white' : 'bg-slate-300'} rounded-full ${cam.status === 'online' ? 'animate-pulse' : ''}`}></span> {cam.status?.toUpperCase() || 'OFFLINE'}
                  </div>
                  <div className="absolute bottom-3 left-3">
                    <p className="text-white text-sm font-bold">{cam.name}</p>
                    <p className="text-white/70 text-[10px]">
  {cam.location} • Battery: {cam.battery != null ? `${cam.battery}%` : 'N/A'}
</p>
                  </div>
                </div>
              )) : (
                <div className="col-span-2 flex flex-col items-center justify-center p-12 bg-white dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                  <span className="material-symbols-outlined text-4xl text-slate-400 mb-2">videocam_off</span>
                  <p className="text-slate-500 font-bold">No cameras active in this zone</p>
                </div>
              )}
            </div>
          </div>

          {/* Active Alerts Column */}
          <div className="space-y-4 animate-fade-in [animation-delay:200ms]">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
                <span className="material-symbols-outlined text-red-500">campaign</span> Active Threats
              </h3>
              <span className="bg-red-500/10 text-red-500 text-[10px] font-black px-2 py-0.5 rounded-lg ring-1 ring-red-500/20">{alerts?.length || 0} SEVERE</span>
            </div>
            
            <div className="space-y-3">
              {alerts?.length ? alerts.map((alert) => (
                <div key={alert.id} className={`p-4 hud-card !rounded-2xl border-l-[6px] ${alert.severity === 'critical' ? 'border-red-500' : 'border-orange-500'} flex gap-4 hover:scale-[1.02] transform transition-all`}>
                    <div className={`flex-shrink-0 size-10 ${alert.severity === 'critical' ? 'bg-red-500/10 text-red-500' : 'bg-orange-500/10 text-orange-500'} rounded-xl flex items-center justify-center`}>
                    <span className="material-symbols-outlined">{alert.type === 'fire' ? 'local_fire_department' : 'warning'}</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <p className="text-slate-900 dark:text-slate-100 font-bold text-sm uppercase">{alert.type}</p>
                      <span className="text-[10px] text-slate-500 uppercase font-bold text-nowrap">
                        {new Date(alert.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">{alert.location} • Status: {alert.status}</p>
                    <div className="mt-3 flex gap-2">
                      <button className="px-3 py-1.5 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary/90">Dispatch Team</button>
                      <button className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-lg">Dismiss</button>
                    </div>
                  </div>
                </div>
              )) : (
                <div className="p-12 text-center bg-white dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                  <span className="material-symbols-outlined text-emerald-500 text-3xl mb-2">verified_user</span>
                  <p className="text-slate-500 text-xs font-bold italic">Zone Secured. No active threats.</p>
                </div>
              )}
            </div>
            
            <button className="w-full py-3 border border-primary/20 text-primary text-sm font-bold rounded-xl hover:bg-primary/5 transition-colors">
                View Alert History
            </button>
          </div>
        </div>

        {/* Footer Map Preview Placeholder */}
        <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-primary/10 p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-xl">
                <span className="material-symbols-outlined text-primary">map</span>
              </div>
              <div>
                <h4 className="font-bold">Sanctuary Topography</h4>
                <p className="text-sm text-slate-500 dark:text-slate-400">Regional coverage area overview</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex -space-x-2">
                <div className="w-8 h-8 rounded-full border-2 border-white bg-slate-300 flex items-center justify-center text-[10px] font-bold">R1</div>
                <div className="w-8 h-8 rounded-full border-2 border-white bg-primary/20 flex items-center justify-center text-[10px] font-bold">R2</div>
                <div className="w-8 h-8 rounded-full border-2 border-white bg-emerald-200 flex items-center justify-center text-[10px] font-bold">R3</div>
              </div>
              <span className="text-xs text-slate-500 font-medium">3 Rangers Active</span>
            </div>
          </div>
          <div className="relative w-full h-80 bg-slate-100 dark:bg-slate-900/50 rounded-[2.5rem] overflow-hidden border border-primary/10 shadow-2xl group animate-fade-in [animation-delay:300ms]">
            <div className="scanline"></div>
            <MapClient 
              isMini 
              zoom={13}
              cameras={cameras || []}
              alerts={allAlerts || []}
            />
            <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-black/20 backdrop-blur-[1px] pointer-events-none">
              <Link href="/map" className="pointer-events-auto">
                <button className="px-8 py-3 bg-primary text-white font-black text-sm rounded-full shadow-2xl shadow-primary/40 hover:scale-105 active:scale-95 transition-all uppercase tracking-tight">
                  Launch Full Interactive Map
                </button>
              </Link>
            </div>
          </div>
        </div>
      </main>

      <footer className="mt-auto py-8 px-4 border-t border-primary/10 text-center flex-shrink-0 w-full">
        <p className="text-sm text-slate-500 dark:text-slate-400">© 2024 VanRakshak AI — AI Powered Forest Protection</p>
      </footer>
    </div>
  );
}
