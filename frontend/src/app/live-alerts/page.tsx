import { Navigation } from "@/components/Navigation";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { AlertsList } from "@/components/AlertsList";

export default async function LiveAlertsPage() {
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

  // 2. Fetch Initial Alerts (All alerts for this zone to handle history and active)
  const { data: alerts } = await supabase
    .from('alerts')
    .select('*')
    .eq('zone_id', zoneId)
    .order('created_at', { ascending: false });

  return (
    <div className="relative flex h-auto min-h-screen w-full flex-col font-display bg-background-light dark:bg-[#0a141c] text-slate-900 dark:text-slate-100 leading-relaxed pb-24 md:pb-0">
      <Navigation />

      <main className="flex-1 p-4 sm:p-6 flex flex-col gap-6 max-w-[1600px] mx-auto w-full">
        
        {/* Real-time Alerts List & Banner (Client Side) */}
        <AlertsList initialAlerts={alerts || []} zoneId={zoneId} />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6">
          {/* Main Content Area */}
          <div className="lg:col-span-9 flex flex-col gap-6">
            {/* Risk Map */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl overflow-hidden flex-1 relative border border-slate-200 dark:border-slate-800 shadow-xl min-h-[400px]">
              <div className="absolute inset-0 bg-slate-200 dark:bg-slate-950 flex items-center justify-center overflow-hidden">
                <img
                  className="w-full h-full object-cover opacity-60 dark:opacity-40"
                  alt="Satellite map view of dense forest terrain"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuDLjVlZ9Ef8n_7eNzus6CoCYefFe3r7FxQ5sfMQiVOUOF8urWZseomQvn9kVFzFxcOlLaV1d2L2xmrNzDrERxSBvqOuWMvIngoYmW5bMISA5mgG2XTEpRLPYGmqQ250I_BaExeIR9Vg7os-zEAI7K29PEPNdb6u9D-Z7vA4iXFiJZZGCpWkYPPoAnjF5kErNLoT3A3ftBZRRy7l1jxXhfdM_sGJCZCw06AZBRKfflSljg4Hc6JYeP52h_GN6k7yGEb-er9YtauglXY"
                />
                <div className="absolute top-1/4 left-1/3 size-5 md:size-6 bg-red-600 rounded-full border-4 border-white map-pulse"></div>
                <div className="absolute bottom-1/3 right-1/4 size-4 md:size-5 bg-orange-500 rounded-full border-4 border-white map-pulse"></div>
                <div className="absolute inset-0 bg-gradient-to-tr from-red-500/10 via-transparent to-orange-500/10 pointer-events-none"></div>
              </div>

              {/* Map Controls */}
              <div className="absolute top-3 right-3 flex flex-col gap-2">
                <button className="bg-white dark:bg-slate-800 p-2 rounded-lg shadow-lg text-slate-700 dark:text-slate-200">
                  <span className="material-symbols-outlined text-sm">layers</span>
                </button>
              </div>

              <div className="absolute bottom-3 left-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl max-w-[200px]">
                <h5 className="text-xs font-bold uppercase text-slate-500 mb-2">Map Legend</h5>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 text-xs"><div className="size-2.5 bg-red-500 rounded-full shrink-0"></div><span>Fire (Critical)</span></div>
                  <div className="flex items-center gap-2 text-xs"><div className="size-2.5 bg-orange-500 rounded-full shrink-0"></div><span>Animal Sightings</span></div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel: Actions & Status */}
          <div className="lg:col-span-3 flex flex-col gap-6">
            {/* Quick Actions */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
              <h3 className="font-bold text-lg mb-4">Quick Actions</h3>
              <div className="grid grid-cols-2 gap-3">
                <button className="flex flex-col items-center justify-center p-3 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors gap-2">
                  <span className="material-symbols-outlined">airplanemode_active</span>
                  <span className="text-xs font-bold">Launch Drone</span>
                </button>
                <button className="flex flex-col items-center justify-center p-3 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 transition-colors gap-2">
                  <span className="material-symbols-outlined">emergency_share</span>
                  <span className="text-xs font-bold">SOS Alarm</span>
                </button>
                <button className="flex flex-col items-center justify-center p-3 rounded-xl bg-green-50 text-green-700 hover:bg-green-100 transition-colors gap-2 lg:col-span-2">
                  <span className="material-symbols-outlined">group</span>
                  <span className="text-xs font-bold">Dispatch Team</span>
                </button>
              </div>
            </div>

            {/* System Performance */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
              <h3 className="font-bold text-lg mb-4">System Performance</h3>
              <div className="space-y-4">
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Resource Coverage</span>
                    <span className="font-bold">92%</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div className="bg-primary h-full w-[92%]"></div>
                  </div>
                </div>
                <div className="flex flex-col gap-1 text-sm mt-4">
                    <span className="text-slate-500">Active Duty Staff</span>
                    <div className="flex -space-x-2 mt-2">
                        {[1,2,3,4].map(i => (
                            <div key={i} className="size-8 rounded-full border-2 border-white dark:border-slate-900 bg-slate-300 flex items-center justify-center text-[10px] font-bold">R{i}</div>
                        ))}
                    </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

