import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { AnalyticsClient } from "@/components/AnalyticsClient";

export default async function AnalyticsPage() {
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

  // 2. Fetch All Alerts for Analytics
  const { data: alerts } = await supabase
    .from('alerts')
    .select('*')
    .eq('zone_id', zoneId)
    .order('created_at', { ascending: false });

  // 3. Fetch Camera Stats
  const { data: cameras } = await supabase
    .from('cameras')
    .select('status')
    .eq('zone_id', zoneId);

  const totalCameras = cameras?.length || 0;
  const onlineCameras = cameras?.filter(c => c.status === 'online').length || 0;

  return (
    <div className="relative flex min-h-screen w-full flex-col font-display bg-background-light dark:bg-[#0a141c]">
      <AnalyticsClient 
        initialAlerts={alerts || []} 
        cameraCount={totalCameras}
        onlineCameraCount={onlineCameras}
        zoneId={zoneId}
      />
      
      {/* Background Pattern */}
      <div className="fixed inset-0 -z-10 pointer-events-none opacity-5">
        <div className="absolute inset-0" style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuCfWu4e-Wm03h2AXEy167Jxy3MuJZmEweftSUPpSLNhNWeWhC3OcEgzM9Yk7sNIBmhh0uUrmrxXVba1wYvVPmAV6QjpZa3vV0tTQhKpkG04NjNhe0r0Tx7FIWl6js-qBKM2gtRVOPNcIM3t3c2jmHXtMPAOGgnQm8p1rFieU56YH_SfxPaxvnsrgr74G1Ci0EZkTKeIDVVNW4LDDcFbWCYEmbgGGvuDetDgdiTu74aRV7Tg70kvMGIZ3titdLMhbl70SuGH_Av_NJE')" }}></div>
      </div>
    </div>
  );
}
