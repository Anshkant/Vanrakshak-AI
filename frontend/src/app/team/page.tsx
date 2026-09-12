import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { TeamManager as TeamManagerComponent } from "@/components/TeamManager";

export default async function TeamPage() {
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

  // 2. Fetch All Team Members for this zone
  const { data: members } = await supabase
    .from('profiles')
    .select('id, full_name, role, zone_id, chat_id')
    .eq('zone_id', zoneId);

  return (
    <div className="relative flex min-h-screen w-full flex-col bg-background-light dark:bg-[#0a141c] font-display text-slate-900 dark:text-slate-100">
      <TeamManagerComponent 
        initialMembers={members || []} 
        userProfile={{
          id: user.id,
          role: profile?.role,
          zone_id: zoneId
        }} 
      />
      
      {/* Background Pattern */}
      <div className="fixed inset-0 -z-10 pointer-events-none opacity-5">
        <div className="absolute inset-0" style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuCfWu4e-Wm03h2AXEy167Jxy3MuJZmEweftSUPpSLNhNWeWhC3OcEgzM9Yk7sNIBmhh0uUrmrxXVba1wYvVPmAV6QjpZa3vV0tTQhKpkG04NjNhe0r0Tx7FIWl6js-qBKM2gtRVOPNcIM3t3c2jmHXtMPAOGgnQm8p1rFieU56YH_SfxPaxvnsrgr74G1Ci0EZkTKeIDVVNW4LDDcFbWCYEmbgGGvuDetDgdiTu74aRV7Tg70kvMGIZ3titdLMhbl70SuGH_Av_NJE')" }}></div>
      </div>
    </div>
  );
}
