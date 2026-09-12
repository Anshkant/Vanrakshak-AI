'use client'

import { useState, useMemo } from 'react'
import { Navigation } from "@/components/Navigation"
import Link from 'next/link'

interface Alert {
  id: string
  type: string
  location: string
  severity: string
  status: string
  created_at: string
  zone_id: string
  // New Fields
  animal_type?: string
  camera_name?: string
  track_id?: string
  movement?: string
  speed?: string
  detection_time?: string
}

interface ReportsManagerProps {
  initialAlerts: Alert[]
  zoneId: string
}

export function ReportsManager({ initialAlerts, zoneId }: ReportsManagerProps) {
  const [activeTab, setActiveTab] = useState<'daily' | 'weekly' | 'monthly'>('daily')
  const [currentPage, setCurrentPage] = useState(1)
  const rowsPerPage = 10

  // 1. Filter alerts by the active tab timeframe
  const filteredAlerts = useMemo(() => {
    const now = new Date()
    const cutoff = new Date()
    
    if (activeTab === 'daily') cutoff.setDate(now.getDate() - 1)
    else if (activeTab === 'weekly') cutoff.setDate(now.getDate() - 7)
    else if (activeTab === 'monthly') cutoff.setMonth(now.getMonth() - 1)
    
    return initialAlerts.filter(a => new Date(a.created_at) >= cutoff)
  }, [initialAlerts, activeTab])

  // 2. Calculate dynamic KPIs for the current set
  const totalSightings = filteredAlerts.length
  const activeAlerts = filteredAlerts.filter(a => a.status !== 'resolved').length
  const criticalCount = filteredAlerts.filter(a => a.severity.toLowerCase() === 'critical').length
  const poachingRisk = criticalCount > 5 ? 'High' : criticalCount > 2 ? 'Medium' : 'Low'

  // 3. Pagination Logic
  const totalPages = Math.ceil(filteredAlerts.length / rowsPerPage) || 1
  const displayAlerts = filteredAlerts.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage)

  // 4. CSV Export
  const handleExport = () => {
    const headers = ['Time', 'Animal', 'Camera', 'Track ID', 'Movement', 'Speed', 'Status', 'Location']
    const rows = filteredAlerts.map(a => [
      new Date(a.detection_time || a.created_at).toLocaleString(),
      a.animal_type || a.type,
      a.camera_name || 'N/A',
      a.track_id || 'N/A',
      a.movement || 'N/A',
      a.speed || 'N/A',
      a.status,
      a.location
    ])
    
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n")
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.setAttribute('hidden', '')
    a.setAttribute('href', url)
    a.setAttribute('download', `VanRakshak_Report_${activeTab}_${new Date().toISOString().slice(0,10)}.csv`)
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <div className="layout-container flex h-full grow flex-col">
      <Navigation />
      
      <main className="flex flex-1 justify-center py-8">
        <div className="layout-content-container flex flex-col max-w-[1280px] flex-1 px-4 sm:px-6 md:px-10">
          <div className="flex flex-wrap justify-between items-start md:items-end gap-4 mb-6">
            <div className="flex flex-col gap-1">
              <h1 className="text-slate-900 dark:text-white text-3xl md:text-4xl font-black leading-tight tracking-tight">Activity Reports</h1>
              <p className="text-slate-500 dark:text-slate-400 text-base">Comprehensive monitoring logs for Zone {zoneId}.</p>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={handleExport}
                className="flex items-center justify-center rounded-lg h-10 px-4 bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors shadow-sm"
              >
                <span className="material-symbols-outlined mr-2 text-lg">download</span>
                <span>Export {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Data</span>
              </button>
            </div>
          </div>
          
          {/* Tabs Container */}
          <div className="mb-8">
            <div className="flex border-b border-slate-200 dark:border-slate-800 gap-8">
              {(['daily', 'weekly', 'monthly'] as const).map((tab) => (
                <button 
                  key={tab}
                  onClick={() => { setActiveTab(tab); setCurrentPage(1); }}
                  className={`flex items-center border-b-2 pb-3 pt-4 px-2 transition-all ${activeTab === tab ? 'border-primary text-primary font-bold' : 'border-transparent text-slate-500 font-medium'}`}
                >
                  <span className="text-sm capitalize">{tab}</span>
                </button>
              ))}
            </div>
          </div>
          
          {/* KPI Dashboard */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="flex flex-col gap-2 rounded-xl p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 shadow-sm">
              <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Sightings</p>
              <p className="text-slate-900 dark:text-white text-3xl font-black tracking-tight">{totalSightings}</p>
            </div>
            <div className="flex flex-col gap-2 rounded-xl p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 shadow-sm">
              <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Active Alerts</p>
              <p className="text-slate-900 dark:text-white text-3xl font-black tracking-tight">{activeAlerts}</p>
            </div>
            <div className="flex flex-col gap-2 rounded-xl p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 shadow-sm">
              <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Poaching Risk</p>
              <p className={`text-3xl font-black tracking-tight ${poachingRisk === 'High' ? 'text-red-500' : poachingRisk === 'Medium' ? 'text-amber-500' : 'text-emerald-500'}`}>{poachingRisk}</p>
            </div>
            <div className="flex flex-col gap-2 rounded-xl p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 shadow-sm">
              <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Critical Today</p>
              <p className="text-slate-900 dark:text-white text-3xl font-black tracking-tight">{criticalCount}</p>
            </div>
          </div>
          
          {/* Logs Table */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50">
                    <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Time</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Animal</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Camera</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Track ID</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Movement</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Speed</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Status</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Location</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {displayAlerts.map((alert) => (
                    <tr key={alert.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-4 text-[10px] font-mono text-slate-500 whitespace-nowrap">
                        {new Date(alert.detection_time || alert.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-6 py-4 font-bold text-sm text-slate-900 dark:text-white">{alert.animal_type || alert.type}</td>
                      <td className="px-6 py-4 text-xs font-bold text-slate-600 dark:text-slate-400">{alert.camera_name || '—'}</td>
                      <td className="px-6 py-4 text-[10px] font-mono text-slate-500">{alert.track_id || '—'}</td>
                      <td className="px-6 py-4 text-xs">{alert.movement || '—'}</td>
                      <td className="px-6 py-4 text-xs font-bold text-primary">{alert.speed || '—'}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${alert.status === 'resolved' ? 'bg-emerald-100 text-emerald-800' : 'bg-primary/10 text-primary'}`}>
                          {alert.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-medium">{alert.location}</td>
                    </tr>
                  ))}
                  {displayAlerts.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">No logs found for this period</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            
            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30">
                <p className="text-xs text-slate-500">Page {currentPage} of {totalPages}</p>
                <div className="flex gap-2">
                  <button 
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    className="size-9 border border-slate-200 dark:border-slate-700 rounded-lg flex items-center justify-center disabled:opacity-30"
                  >
                    <span className="material-symbols-outlined text-base">chevron_left</span>
                  </button>
                  <button 
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    className="size-9 border border-slate-200 dark:border-slate-700 rounded-lg flex items-center justify-center disabled:opacity-30"
                  >
                    <span className="material-symbols-outlined text-base">chevron_right</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
