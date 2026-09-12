import { Navigation } from "@/components/Navigation";
import Link from 'next/link';

export default function CamerasPage() {
  return (
    <div className="bg-background-light dark:bg-[#0a141c] font-display text-slate-900 dark:text-slate-100 min-h-screen">
      <Navigation />

      <main className="flex-1 px-4 sm:px-6 md:px-10 py-6 md:py-8 max-w-[1600px] mx-auto">
        {/* Page Header & Stats Summary */}
        <div className="flex flex-col lg:flex-row justify-between items-start gap-6 mb-8">
          <div>
            <h1 className="text-xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight">Camera Fleet Management</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Real-time surveillance monitoring for the Western Ghats Reserve.</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full lg:w-auto">
            <div className="flex flex-col gap-1 rounded-xl p-3 md:p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                <p className="text-xs font-bold uppercase tracking-wider">Active</p>
                <span className="material-symbols-outlined text-primary text-sm">videocam</span>
              </div>
              <p className="text-slate-900 dark:text-white text-xl md:text-2xl font-black">124/130</p>
              <p className="text-green-600 text-xs font-bold">+2% vs last week</p>
            </div>
            <div className="flex flex-col gap-1 rounded-xl p-3 md:p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                <p className="text-xs font-bold uppercase tracking-wider">Uptime</p>
                <span className="material-symbols-outlined text-green-500 text-sm">sensors</span>
              </div>
              <p className="text-slate-900 dark:text-white text-xl md:text-2xl font-black">99.8%</p>
              <p className="text-slate-500 text-xs">Healthy Network</p>
            </div>
            <div className="flex flex-col gap-1 rounded-xl p-3 md:p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                <p className="text-xs font-bold uppercase tracking-wider">Battery</p>
                <span className="material-symbols-outlined text-amber-500 text-sm">battery_alert</span>
              </div>
              <p className="text-slate-900 dark:text-white text-xl md:text-2xl font-black">04</p>
              <p className="text-amber-600 text-xs font-bold">Needs Attention</p>
            </div>
            <div className="flex flex-col gap-1 rounded-xl p-3 md:p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                <p className="text-xs font-bold uppercase tracking-wider">AI Events</p>
                <span className="material-symbols-outlined text-primary text-sm">psychology</span>
              </div>
              <p className="text-slate-900 dark:text-white text-xl md:text-2xl font-black">1,248</p>
              <p className="text-slate-500 text-xs">Last 24 Hours</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Left: Camera Grid */}
          <div className="xl:col-span-2 flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <h2 className="text-slate-900 dark:text-white text-lg md:text-xl font-bold">Live Stream Matrix</h2>
              <div className="flex gap-2">
                <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold">
                  <span className="material-symbols-outlined text-[16px]">grid_view</span> Grid
                </button>
                <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded hover:bg-white dark:hover:bg-slate-900 text-slate-500 text-xs font-bold">
                  <span className="material-symbols-outlined text-[16px]">list</span> List
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              {/* Camera Feed 1 */}
              <div className="group relative aspect-video bg-slate-800 rounded-xl overflow-hidden border-2 border-transparent hover:border-primary transition-all">
                <img className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt="Live camera feed from lush green forest floor" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAMqTxx1wqaZj7n121eyrVHzYyHI8KDDdgHco4MUziZBJcLtenLcIIA_-zo7kyXOUyCRcPqryEYxcVLFa6uITMJnTpkAxkYE2E0tHG0wizIOth1GYSJAIvQnvX7S0pluoDZzWU3ZyAQdA-lQ9E3eryxAXGIXSDzKq1CY5PqsJTiWEK6hDBS8otlso4XF6uC4ir5cqAiPzB0TP90RS7GEWMHufFh96XdkpWkestQZdNbOdvUGY2hPXJW2zU57DVrvsjg0QUXn-3Hp18"/>
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 p-2 md:p-3 flex flex-col justify-between pointer-events-none">
                  <div className="flex justify-between items-start">
                    <span className="px-1.5 py-0.5 rounded bg-red-600 text-white text-[9px] font-black uppercase flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span> LIVE
                    </span>
                    <span className="text-white/70 text-[9px] font-mono bg-black/40 px-1 py-0.5 rounded">1080p</span>
                  </div>
                  <div>
                    <p className="text-white text-xs font-bold">Zone A1: Buffer North</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-green-400 text-[9px] flex items-center gap-0.5"><span className="material-symbols-outlined text-[11px]">battery_full</span> 92%</span>
                      <span className="text-blue-400 text-[9px] flex items-center gap-0.5"><span className="material-symbols-outlined text-[11px]">wifi</span> Strong</span>
                    </div>
                  </div>
                </div>
              </div>
              {/* Camera Feed 2 */}
              <div className="group relative aspect-video bg-slate-800 rounded-xl overflow-hidden border-2 border-transparent hover:border-primary transition-all">
                <img className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt="Wide angle view of forest trail with pine trees" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBliXOqmsgwRhL5enrL5wE05OVwvk6Z2j8Wc-4bZ4hl3ksfU-cBGW07dr7tts_o_CcV4Yj-qHw4mn5KcNMpCqEqmU8DuC8bVO0GlPq17m51k6SYxYz7vtHCZyUAhE8O73OhWQXmAkh7yNmXi8Lz4P3yyFJPqIclChHKZbVxrbLgCCQ_-XpFCcb1TBWk3-romcTlkKrwHOem9GWradAA5FPTvU6Q2J1ZVGMWkvIMVNVM3g3beU1m1Ra0zuL6I7tvKxARE2m5vROAnkE"/>
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 p-2 md:p-3 flex flex-col justify-between pointer-events-none">
                  <div className="flex justify-between items-start">
                    <span className="px-1.5 py-0.5 rounded bg-red-600 text-white text-[9px] font-black uppercase flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span> LIVE</span>
                  </div>
                  <div>
                    <p className="text-white text-xs font-bold">Zone B4: Elephant Corridor</p>
                    <span className="text-amber-400 text-[9px] flex items-center gap-0.5 mt-0.5"><span className="material-symbols-outlined text-[11px]">battery_3_bar</span> 45%</span>
                  </div>
                </div>
              </div>
              {/* Camera Feed 3 */}
              <div className="group relative aspect-video bg-slate-800 rounded-xl overflow-hidden border-2 border-transparent hover:border-primary transition-all">
                <img className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt="Close up of sunlight filtering through forest canopy" src="https://lh3.googleusercontent.com/aida-public/AB6AXuD8Ydk0dDGjaI5J2XhDgWAZi5vl4X0Rs6XD_auLzaYyt9XccUg7SiU_p_VPrm3fA8ti3XcfYeIHY7Qs2W6vznYcjQ3WeKhg7phc4u9UaMUbjoksDoPq_Cd5fiTsy47JDEU1pQ67bJcbycN5P2SmH5MAcN6agZxjRuB05AdYEnGuoHyKfiqTKHaZ7QC4a6b_2jVqwb1EVmPZhKI5TPTEGrUhyk3AskYtJMulYM9m-ikw9wf6-i-AM5KT8a_vuWG4fKKpVbZ0jyPSUoA"/>
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 p-2 md:p-3 flex flex-col justify-between pointer-events-none">
                  <div className="flex justify-between items-start">
                    <span className="px-1.5 py-0.5 rounded bg-red-600 text-white text-[9px] font-black uppercase flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span> LIVE</span>
                  </div>
                  <div>
                    <p className="text-white text-xs font-bold">Zone C2: Watering Hole</p>
                    <span className="text-green-400 text-[9px] flex items-center gap-0.5 mt-0.5"><span className="material-symbols-outlined text-[11px]">battery_full</span> 88%</span>
                  </div>
                </div>
              </div>
              {/* Camera Feed 4 */}
              <div className="group relative aspect-video bg-slate-800 rounded-xl overflow-hidden border-2 border-transparent hover:border-primary transition-all">
                <img className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt="Foggy forest morning view" src="https://lh3.googleusercontent.com/aida-public/AB6AXuASz2nrJ3bqwbmTNVRYpj6v3MEifgBQ6kd1oG5d6hC6h8_CnehR8t9nHPpEAqP7J_03ehGWrXxtI34QBVcx7cA1kGdn7qzZ-hNoU9NfH8shIjNVMLIyzoi1eNnr_80zSL3y8D-BB-7AQ53FEUKZ_ZOmMWkCYaeU3tpHf1ajWOWNiSfXiwl0QArpJws_XYIo-81L7oFKTWDwv5QAiTFBP5xwsSl4jHrpElvhMooDDDdIYYNOSTo6FIZqk3S_sDFjwvrwAT3UyQDGvOs"/>
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 p-2 md:p-3 flex flex-col justify-between pointer-events-none">
                  <div>
                    <span className="px-1.5 py-0.5 rounded bg-slate-600 text-white text-[9px] font-black uppercase flex items-center gap-1 w-fit"><span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span> OFFLINE</span>
                  </div>
                  <div>
                    <p className="text-white text-xs font-bold">Zone D1: Dense Scrub</p>
                    <p className="text-red-400 text-[9px] mt-0.5 italic">Last seen: 2 hrs ago</p>
                  </div>
                </div>
              </div>
              {/* Camera Feed 5 */}
              <div className="group relative aspect-video bg-slate-800 rounded-xl overflow-hidden border-2 border-transparent hover:border-primary transition-all">
                <img className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt="Mountain view from forest clearing" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCDnS-hm48gED40UK_HSywaWRr5FYGlRuPGEHXW-Yyb4_GFOAPm5oM1jemiBSjFf_OqRj4_RK30zFGmnEFouJYLI9lmYMwvo9-vpX__MPnJkoO7hF3BFwjoYyt3_rCB7WHrfP4G_1QL6-borZ1z3P8ZD5X1IxfEMHh8BQPxixwIToUy7tTcfR826aU52Iak8zZcffTKXxafaXASlHkHe-wqu2vyIFet7CO6unJwsvEcP5vdiJMti-aN2WW0C7enn2VyKA8FVYEjrpU"/>
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 p-2 md:p-3 flex flex-col justify-between pointer-events-none">
                  <div>
                    <span className="px-1.5 py-0.5 rounded bg-red-600 text-white text-[9px] font-black uppercase flex items-center gap-1 w-fit"><span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span> LIVE</span>
                  </div>
                  <div>
                    <p className="text-white text-xs font-bold">Zone E2: South Ridge</p>
                    <span className="text-red-500 text-[9px] font-black animate-pulse flex items-center gap-0.5 mt-0.5"><span className="material-symbols-outlined text-[11px]">battery_low</span> 8% LOW</span>
                  </div>
                </div>
              </div>
              {/* Camera Feed 6 */}
              <div className="group relative aspect-video bg-slate-800 rounded-xl overflow-hidden border-2 border-transparent hover:border-primary transition-all">
                <img className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt="High altitude forest canopy view" src="https://lh3.googleusercontent.com/aida-public/AB6AXuARoPToKEnVFzMpriM_OcU9mjdHeqGutyOm4XMgXGyCqZrMEnwQAU-UFip74bm2UmWfwDnXDtJlBIKhZqiL4F3VQf5pYHp4_2W79ioXCn0uISkqsC2ybR6n02K0yX2xzQh6GfRIbeUNcMEaRJ98fWwuONiFxGSVvg3ek5RTfuX8ErizvafNWPsvSjuPYZFxkkYMUYP7EgipswUy3ATZE9VMHasaEibNWjk570HS735fT7-7COw7tki-ZWXnXC7onod4MHLS08n4Klg"/>
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 p-2 md:p-3 flex flex-col justify-between pointer-events-none">
                  <div>
                    <span className="px-1.5 py-0.5 rounded bg-red-600 text-white text-[9px] font-black uppercase flex items-center gap-1 w-fit"><span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span> LIVE</span>
                  </div>
                  <div>
                    <p className="text-white text-xs font-bold">Zone F1: Boundary Entry</p>
                    <span className="text-green-400 text-[9px] flex items-center gap-0.5 mt-0.5"><span className="material-symbols-outlined text-[11px]">battery_full</span> 100%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Health Dashboard Table */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
                <h3 className="font-bold text-slate-900 dark:text-white">Detailed Device Health</h3>
                <button className="text-primary text-xs font-bold hover:underline">Download CSV</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm min-w-[500px]">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Camera ID</th>
                      <th className="px-4 py-3">Location</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Battery</th>
                      <th className="px-4 py-3">Storage</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-primary font-bold">VR-A1-001</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">Buffer North Trail</td>
                      <td className="px-4 py-3"><span className="flex items-center gap-1.5 text-green-600 font-semibold text-xs"><span className="w-1.5 h-1.5 rounded-full bg-green-600"></span>Online</span></td>
                      <td className="px-4 py-3"><div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5"><div className="bg-green-500 h-1.5 rounded-full" style={{ width: '92%' }}></div></div></td>
                      <td className="px-4 py-3"><div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5"><div className="bg-primary h-1.5 rounded-full" style={{ width: '65%' }}></div></div></td>
                      <td className="px-4 py-3 text-right"><button className="material-symbols-outlined text-slate-400 hover:text-primary">more_vert</button></td>
                    </tr>
                    <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-primary font-bold">VR-B4-012</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">Elephant Corridor</td>
                      <td className="px-4 py-3"><span className="flex items-center gap-1.5 text-green-600 font-semibold text-xs"><span className="w-1.5 h-1.5 rounded-full bg-green-600"></span>Online</span></td>
                      <td className="px-4 py-3"><div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5"><div className="bg-amber-500 h-1.5 rounded-full" style={{ width: '45%' }}></div></div></td>
                      <td className="px-4 py-3"><div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5"><div className="bg-primary h-1.5 rounded-full" style={{ width: '82%' }}></div></div></td>
                      <td className="px-4 py-3 text-right"><button className="material-symbols-outlined text-slate-400 hover:text-primary">more_vert</button></td>
                    </tr>
                    <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-primary font-bold">VR-E2-009</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">South Ridge Pass</td>
                      <td className="px-4 py-3"><span className="flex items-center gap-1.5 text-amber-600 font-semibold text-xs"><span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>Warning</span></td>
                      <td className="px-4 py-3"><div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5"><div className="bg-red-500 h-1.5 rounded-full" style={{ width: '8%' }}></div></div></td>
                      <td className="px-4 py-3"><div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5"><div className="bg-primary h-1.5 rounded-full" style={{ width: '12%' }}></div></div></td>
                      <td className="px-4 py-3 text-right"><button className="material-symbols-outlined text-slate-400 hover:text-primary">more_vert</button></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right: Map & Context */}
          <div className="xl:col-span-1 flex flex-col gap-6">
            {/* Mini Map */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
                <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">map</span> Deployment Map
                </h3>
                <button className="text-xs font-bold px-2 py-1 rounded bg-slate-100 dark:bg-slate-800">Fullscreen</button>
              </div>
              <div className="relative w-full h-[240px] md:h-[300px] bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <img className="w-full h-full object-cover" alt="Satellite view of forest reserve area" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCErZz7TpktR_goxfZ_VaTL2H86FKYwM10YxXFCdm9elLtFswxnFEEs-PJblpwrUgm2IwnlTwQN23RFOBng8lBBndxmY95BvEgZF32PYYfxppyGKl_6gk8NKZDoykGq7I8aRjKndheUYDCmQnOjMizLAerK2yJnt7f1qOqDaNnPc2EybyHwu-P9rdowklWUUnnDK9C-QsDEJ0vU0k_Amft6e0hKEKBLu2akoTv2k9A0E0ss9KSJL4ejSepXnj8_GgezW94s5rQLN8U"/>
                <div className="absolute top-1/4 left-1/3 w-3.5 h-3.5 rounded-full bg-green-500 border-2 border-white shadow-lg animate-pulse"></div>
                <div className="absolute top-1/2 left-1/2 w-3.5 h-3.5 rounded-full bg-green-500 border-2 border-white shadow-lg"></div>
                <div className="absolute bottom-1/3 right-1/4 w-3.5 h-3.5 rounded-full bg-red-500 border-2 border-white shadow-lg"></div>
                <div className="absolute top-2/3 left-1/4 w-3.5 h-3.5 rounded-full bg-amber-500 border-2 border-white shadow-lg"></div>
                <div className="absolute bottom-3 left-3 p-2 bg-white/90 dark:bg-slate-900/90 rounded text-[9px] shadow-sm backdrop-blur">
                  <div className="flex items-center gap-1.5 mb-1"><span className="w-2 h-2 rounded-full bg-green-500"></span> Active</div>
                  <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500"></span> Alert</div>
                </div>
              </div>
            </div>

            {/* System Log */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
              <h3 className="font-bold text-slate-900 dark:text-white mb-4">Recent System Log</h3>
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="mt-0.5 size-8 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-base">warning</span>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">Motion Detected (Heavy)</p>
                    <p className="text-[11px] text-slate-500">Zone B4 - VR-B4-012 | 2 mins ago</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="mt-0.5 size-8 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-base">sync</span>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">Firmware Updated</p>
                    <p className="text-[11px] text-slate-500">8 Cameras updated | 1 hr ago</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="mt-0.5 size-8 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-base">battery_alert</span>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">Low Power Warning</p>
                    <p className="text-[11px] text-slate-500">Zone E2 - VR-E2-009 | 4 hrs ago</p>
                  </div>
                </div>
              </div>
              <button className="w-full mt-5 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 text-xs font-bold hover:bg-slate-100 transition-all border border-slate-200 dark:border-slate-700">View All Logs</button>
            </div>

            {/* Maintenance Card */}
            <div className="bg-primary rounded-xl p-5 text-white shadow-lg overflow-hidden relative">
              <div className="relative z-10">
                <h3 className="font-bold text-lg mb-1">Preventive Care</h3>
                <p className="text-xs text-white/80 mb-4">Upcoming battery replacement schedule for Zone B cameras.</p>
                <div className="flex items-center justify-between bg-white/10 rounded-lg p-3">
                  <div>
                    <p className="text-[10px] opacity-70 uppercase font-black">Next Task</p>
                    <p className="text-sm font-bold">Drone Deployment</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] opacity-70 uppercase font-black">Due in</p>
                    <p className="text-sm font-bold">14 hrs</p>
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-6 -right-6 opacity-10">
                <span className="material-symbols-outlined text-9xl">engineering</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="mt-12 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0a141c] py-8 pb-28 md:pb-8">
        <div className="max-w-[1600px] mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4 text-center">
          <div className="flex items-center gap-2 text-slate-500">
            <span className="material-symbols-outlined text-lg">forest</span>
            <p className="text-sm font-medium">© 2024 VanRakshak AI — Advanced Fleet Monitoring.</p>
          </div>
          <div className="flex gap-6 flex-wrap justify-center">
            <Link className="text-xs font-bold text-slate-500 hover:text-primary uppercase tracking-widest" href="#">Privacy</Link>
            <Link className="text-xs font-bold text-slate-500 hover:text-primary uppercase tracking-widest" href="#">System Status</Link>
            <Link className="text-xs font-bold text-slate-500 hover:text-primary uppercase tracking-widest" href="#">Support</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
