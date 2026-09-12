import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { ReportsManager } from "@/components/ReportsManager";
import Link from 'next/link';

export default async function ReportsPage() {
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

  // 2. Fetch All Historical Alerts for Reporting
  const { data: alerts } = await supabase
    .from('alerts')
    .select('*')
    .eq('zone_id', zoneId)
    .order('created_at', { ascending: false });

  return (
    <div className="relative flex h-auto min-h-screen w-full flex-col bg-background-light dark:bg-[#0a141c] font-display text-slate-900 dark:text-slate-100">
      <ReportsManager initialAlerts={alerts || []} zoneId={zoneId} />
      
      <footer className="mt-auto py-10 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0a141c] pb-28 md:pb-10">
        <div className="max-w-[1280px] mx-auto px-10 flex flex-wrap justify-center md:justify-between items-center gap-8">
          <div className="flex items-center gap-2 text-primary/60">
            <span className="material-symbols-outlined">forest</span>
            <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">VanRakshak AI — Advanced Forest Monitoring System</span>
          </div>
          <div className="flex gap-4 md:gap-8 flex-wrap justify-center">
            <Link className="text-sm text-slate-500 dark:text-slate-400 hover:text-primary transition-colors" href="#">Privacy Policy</Link>
            <Link className="text-sm text-slate-500 dark:text-slate-400 hover:text-primary transition-colors" href="#">Compliance</Link>
            <Link className="text-sm text-slate-500 dark:text-slate-400 hover:text-primary transition-colors" href="#">Support</Link>
          </div>
        </div>
      </footer>

      {/* Background Pattern */}
      <div className="fixed inset-0 -z-10 pointer-events-none opacity-5">
        <div className="absolute inset-0" style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuCfWu4e-Wm03h2AXEy167Jxy3MuJZmEweftSUPpSLNhNWeWhC3OcEgzM9Yk7sNIBmhh0uUrmrxXVba1wYvVPmAV6QjpZa3vV0tTQhKpkG04NjNhe0r0Tx7FIWl6js-qBKM2gtRVOPNcIM3t3c2jmHXtMPAOGgnQm8p1rFieU56YH_SfxPaxvnsrgr74G1Ci0EZkTKeIDVVNW4LDDcFbWCYEmbgGGvuDetDgdiTu74aRV7Tg70kvMGIZ3titdLMhbl70SuGH_Av_NJE')" }}></div>
      </div>
    </div>
  );
}
