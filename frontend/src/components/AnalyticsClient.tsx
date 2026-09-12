'use client'

import { useState, useMemo } from 'react'
import { Navigation } from "@/components/Navigation"
import Link from 'next/link'

interface Alert {
  id: string
  type: string
  severity: string
  status: string
  created_at: string
  zone_id: string
}

interface AnalyticsClientProps {
  initialAlerts: Alert[]
  cameraCount: number
  onlineCameraCount: number
  zoneId: string
}

export function AnalyticsClient({ initialAlerts, cameraCount, onlineCameraCount, zoneId }: AnalyticsClientProps) {
  const [timeRange, setTimeRange] = useState('30') // '7' or '30' or '90'

  // 1. Filter alerts by time range
  const filteredAlerts = useMemo(() => {
    const days = parseInt(timeRange)
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    return initialAlerts.filter(a => new Date(a.created_at) >= cutoff)
  }, [initialAlerts, timeRange])

  // 2. Calculate KPIs
  const totalSightings = filteredAlerts.length
  const intrusions = filteredAlerts.filter(a => ['human', 'vehicle', 'poacher'].includes(a.type.toLowerCase())).length
  const aiConfidence = 98.2 // Mock for now or calculated from resolved/total ratio
  
  // 3. Generate Chart Data: Daily Trends (Last 30 days)
  const intrusionTrends = useMemo(() => {
    const days = 30
    const data = Array(days).fill(0)
    const today = new Date()
    
    initialAlerts.forEach(a => {
      if (['human', 'vehicle', 'poacher'].includes(a.type.toLowerCase())) {
        const diff = Math.floor((today.getTime() - new Date(a.created_at).getTime()) / (1000 * 60 * 60 * 24))
        if (diff < days) data[days - 1 - diff]++
      }
    })
    
    // Convert to SVG path: width 800, height 200
    // X step = 800/29, Y scale = 200 / max_value
    const max = Math.max(...data, 5) // at least 5 for scale
    const stepX = 800 / (days - 1)
    const points = data.map((val, i) => `${i * stepX},${180 - (val / max) * 150}`)
    return {
      path: `M ${points.join(' L ')}`,
      fill: `M 0,200 L ${points.join(' L ')} L 800,200 Z`
    }
  }, [initialAlerts])

  // 4. Species Distribution data
  const speciesData = useMemo(() => {
    const counts: Record<string, number> = {}
    filteredAlerts.forEach(a => {
      const t = a.type.toLowerCase()
      counts[t] = (counts[t] || 0) + 1
    })
    const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1
    return {
      tiger: ((counts['tiger'] || 0) / total) * 100,
      deer: ((counts['deer'] || counts['animal'] || 0) / total) * 100,
      leopard: ((counts['leopard'] || 0) / total) * 100,
      other: 100 - (((counts['tiger'] || 0) + (counts['deer'] || counts['animal'] || 0) + (counts['leopard'] || 0)) / total) * 100
    }
  }, [filteredAlerts])

  return (
    <div className="layout-container flex h-full grow flex-col">
      <Navigation />
      
      <main className="flex-1 px-4 sm:px-6 md:px-10 py-6 md:py-8 max-w-[1440px] mx-auto w-full">
        {/* Header & Actions */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-10 pt-4 animate-fade-in">
          <div>
            <h1 className="text-4xl font-black text-slate-900 dark:text-slate-100 tracking-tight leading-none">Wildlife Intelligence Analytics</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-2 font-black uppercase text-[10px] tracking-widest">Sector Reconnaissance // Zone {zoneId}.</p>
          </div>
          <div className="flex gap-3">
            <button className="flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-900 dark:text-white hover:bg-slate-50 transition-all shadow-xl shadow-primary/5 active:scale-95">
              <span className="material-symbols-outlined text-sm">picture_as_pdf</span>
              Export Intelligence PDF
            </button>
          </div>
        </div>
        
        {/* Filter Bar */}
        <div className="hud-card p-4 mb-8 flex flex-wrap gap-4 items-center animate-fade-in">
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-100/50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-white/5">
            <span className="material-symbols-outlined text-primary text-sm">calendar_today</span>
            <select 
              value={timeRange} 
              onChange={(e) => setTimeRange(e.target.value)}
              className="bg-transparent border-none text-[10px] font-black uppercase tracking-widest text-slate-900 dark:text-white focus:ring-0 cursor-pointer outline-none"
            >
              <option value="30" className="dark:bg-[#0a141c]">Last 30 Days</option>
              <option value="7" className="dark:bg-[#0a141c]">Last 7 Days</option>
              <option value="90" className="dark:bg-[#0a141c]">Last Quarter</option>
            </select>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-100/50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-white/5 ml-auto">
            <span className="material-symbols-outlined text-primary text-sm">filter_list</span>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">Operational Zone: <span className="font-mono text-primary font-black ml-1 text-xs">{zoneId}</span></span>
          </div>
        </div>
        
        {/* KPI Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-12 gap-4 md:gap-6 mb-8 animate-fade-in [animation-delay:100ms]">
          <div className="col-span-1 lg:col-span-3 hud-card p-8 group hover:border-slate-300 dark:hover:border-white/20 transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest">Total Sightings</span>
              <span className="material-symbols-outlined text-primary group-hover:scale-110 transition-transform">visibility</span>
            </div>
            <div className="text-4xl font-black font-mono text-slate-900 dark:text-white">{totalSightings}</div>
          </div>
          <div className="col-span-1 lg:col-span-3 hud-card p-8 group hover:border-red-500/30 transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest">Intrusions</span>
              <span className="material-symbols-outlined text-red-500 group-hover:animate-pulse">warning</span>
            </div>
            <div className="text-4xl font-black font-mono text-slate-900 dark:text-white">{intrusions}</div>
          </div>
          <div className="col-span-1 lg:col-span-3 hud-card p-8 group hover:border-blue-500/30 transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest">AI Confidence</span>
              <span className="material-symbols-outlined text-blue-500 group-hover:rotate-12 transition-transform">verified</span>
            </div>
            <div className="text-4xl font-black font-mono text-slate-900 dark:text-white">{aiConfidence}%</div>
          </div>
          <div className="col-span-1 lg:col-span-3 hud-card p-8 group hover:border-amber-500/30 transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest">Active Sensors</span>
              <span className="material-symbols-outlined text-amber-500 group-hover:scale-110 transition-transform">sensors</span>
            </div>
            <div className="text-4xl font-black font-mono text-slate-900 dark:text-white">{onlineCameraCount}/{cameraCount}</div>
          </div>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in [animation-delay:200ms]">
          {/* Daily Trends SVG */}
          <div className="lg:col-span-8 hud-card p-8 group">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-900 dark:text-white mb-8 flex items-center gap-2">
               <span className="material-symbols-outlined text-sm text-primary">trending_up</span> Intelligence Trends
            </h3>
            <div className="h-[240px] relative w-full pt-4">
              <div className="scanline opacity-10"></div>
              <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 800 200">
                <defs>
                  <linearGradient id="gradPrimary" x1="0%" x2="0%" y1="0%" y2="100%">
                    <stop offset="0%" style={{ stopColor: 'rgba(16,108,178,0.4)', stopOpacity: 1 }}></stop>
                    <stop offset="100%" style={{ stopColor: 'rgba(16,108,178,0)', stopOpacity: 1 }}></stop>
                  </linearGradient>
                </defs>
                <path d={intrusionTrends.fill} fill="url(#gradPrimary)"></path>
                <path d={intrusionTrends.path} fill="none" stroke="#0f76bc" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" className="drop-shadow-[0_0_8px_rgba(16,108,178,0.4)]"></path>
              </svg>
              <div className="flex justify-between mt-4 text-[10px] font-black text-slate-500 dark:text-slate-400 px-2 uppercase tracking-tighter font-mono">
                <span>30D REARWARD</span><span>REAL-TIME STATUS</span>
              </div>
            </div>
          </div>

          {/* Species Pie Chart (SVG based) */}
          <div className="lg:col-span-4 hud-card p-8">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-900 dark:text-white mb-8 flex items-center gap-2">
               <span className="material-symbols-outlined text-sm text-primary">pie_chart</span> Species Radar
            </h3>
            <div className="flex items-center justify-center relative py-4">
              <div className="size-48 rounded-full border-[18px] border-slate-100 dark:border-white/5 relative flex items-center justify-center">
                <svg className="absolute inset-0 size-full -rotate-90">
                  <circle cx="50%" cy="50%" r="42%" fill="none" stroke="#106cb2" strokeWidth="18" strokeDasharray={`${speciesData.tiger * 2.6} 1000`} className="drop-shadow-[0_0_8px_rgba(16,108,178,0.5)]"></circle>
                </svg>
                <div className="text-center">
                  <div className="text-3xl font-black font-mono text-slate-900 dark:text-white leading-none">{Math.round(speciesData.tiger + speciesData.leopard)}%</div>
                  <div className="text-[9px] uppercase font-black text-slate-500 dark:text-slate-400 mt-1 tracking-widest">Predators</div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 mt-8">
              <div className="flex items-center justify-between p-3 bg-slate-100/50 dark:bg-white/5 rounded-2xl border border-slate-200/50 dark:border-white/5">
                <div className="flex items-center gap-3">
                   <div className="size-2 rounded-full bg-primary shadow-[0_0_8px_rgba(16,108,178,0.5)]"></div> 
                   <span className="text-[10px] font-black uppercase text-slate-900 dark:text-white tracking-tight">Bengal Tigers</span>
                </div>
                <span className="font-mono text-xs font-black text-slate-900 dark:text-white">{Math.round(speciesData.tiger)}%</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-100/50 dark:bg-white/5 rounded-2xl border border-slate-200/50 dark:border-white/5">
                <div className="flex items-center gap-3">
                   <div className="size-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div> 
                   <span className="text-[10px] font-black uppercase text-slate-900 dark:text-white tracking-tight">Herbivores</span>
                </div>
                <span className="font-mono text-xs font-black text-slate-900 dark:text-white">{Math.round(speciesData.deer)}%</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="mt-12 py-10 px-6 md:px-10 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
        <div className="max-w-[1440px] mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
             <span className="font-bold">VanRakshak AI Analytics</span>
          </div>
          <p className="text-xs text-slate-500 font-medium tracking-wide">Protecting wildlife at Ranthambore Core.</p>
        </div>
      </footer>
    </div>
  )
}
