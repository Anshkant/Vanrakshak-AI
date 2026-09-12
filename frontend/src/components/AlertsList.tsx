'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import { resolveAlert } from '@/app/actions/alerts'

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

interface AlertsListProps {
  initialAlerts: Alert[]
  zoneId: string
}

export function AlertsList({ initialAlerts, zoneId }: AlertsListProps) {
  const [alerts, setAlerts] = useState<Alert[]>(initialAlerts)
  const supabase = createClient()
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    // 1. Initialize Audio
    audioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3')

    // 2. Set up Realtime Subscription
    const channel = supabase
      .channel('realtime-alerts')
      .on(
        'postgres_changes' as any,
        {
          event: '*', 
          schema: 'public',
          table: 'alerts',
          filter: `zone_id=eq.${zoneId}`
        },
        (payload: any) => {
          if (payload.eventType === 'INSERT') {
            const newAlert = payload.new as Alert
            setAlerts((prev) => [newAlert, ...prev])
            
            // Play beep if critical
            if (newAlert.severity?.toLowerCase() === 'critical') {
              audioRef.current?.play().catch(e => console.error("Audio playback failed:", e))
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedAlert = payload.new as Alert
            setAlerts((prev) => prev.map(a => a.id === updatedAlert.id ? updatedAlert : a))
          } else if (payload.eventType === 'DELETE') {
            const oldId = payload.old?.id
            if (oldId) setAlerts((prev) => prev.filter(a => a.id !== oldId))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [zoneId, supabase])

  const handleResolve = async (id: string) => {
    const result = await resolveAlert(id)
    if (result.error) {
      alert(`Error resolving alert: ${result.error}`)
    }
  }

  const activeAlerts = alerts.filter(a => a.status !== 'resolved')
  const historyAlerts = alerts.filter(a => a.status === 'resolved')
  const latestCritical = alerts.find(a => a.severity?.toLowerCase() === 'critical' && a.status !== 'resolved')

  return (
    <>
      {/* Emergency Banner (Dynamic) */}
      {latestCritical && (
        <div className="bg-red-600 dark:bg-red-700 text-white px-4 sm:px-6 md:px-10 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg mb-6 rounded-xl">
          <div className="flex items-start sm:items-center gap-3">
            <span className="material-symbols-outlined text-xl sm:text-2xl animate-pulse shrink-0 mt-0.5 sm:mt-0">warning</span>
            <div>
              <span className="font-bold text-xs sm:text-sm uppercase tracking-wider block">Critical Emergency Alert</span>
              <span className="text-sm sm:text-base font-medium">{latestCritical.type} detected in {latestCritical.location} — Immediate response required.</span>
            </div>
          </div>
          <div className="flex gap-2 w-full sm:w-auto shrink-0">
            <button 
              onClick={() => handleResolve(latestCritical.id)}
              className="flex-1 sm:flex-none bg-white text-red-600 px-3 py-1.5 rounded font-bold text-xs sm:text-sm shadow-sm hover:bg-slate-100 transition-colors"
            >
              Mark Resolved
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Area: Alerts List */}
        <div className="lg:col-span-3 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg md:text-xl font-bold">Recent Alerts</h3>
            <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-xs font-bold">{activeAlerts.length} Active</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3 overflow-y-auto max-h-[600px] pr-1">
            {activeAlerts.length > 0 ? activeAlerts.map((alert) => (
              <div key={alert.id} className={`bg-white dark:bg-slate-900 p-4 rounded-xl border-l-4 ${alert.severity === 'critical' ? 'border-red-500' : alert.severity === 'high' ? 'border-orange-500' : 'border-primary'} shadow-sm hover:shadow-md transition-shadow`}>
                <div className="flex flex-col gap-3">
                  <div className="flex justify-between items-start">
                    <div className="flex flex-col">
                      <h4 className="font-black text-slate-900 dark:text-slate-100 text-sm uppercase tracking-tight">{alert.animal_type || alert.type} </h4>
                      <p className="text-[10px] font-bold text-primary uppercase">Track: {alert.track_id || 'UNKNOWN'}</p>
                    </div>
                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded shrink-0 ${alert.severity === 'critical' ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600'}`}>
                      {alert.severity.toUpperCase()}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-y-2 border-t border-slate-50 dark:border-slate-800 pt-3">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Camera</span>
                      <span className="text-[11px] font-bold">{alert.camera_name || 'N/A'}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Movement</span>
                      <span className="text-[11px] font-bold">{alert.movement || 'N/A'}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Speed</span>
                      <span className="text-[11px] font-black text-primary">{alert.speed || 'N/A'}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Time</span>
                      <span className="text-[11px] font-bold">{new Date(alert.detection_time || alert.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-1 pt-2 border-t border-slate-50 dark:border-slate-800">
                    <p className="text-[10px] font-bold text-slate-500 truncate max-w-[120px]">{alert.location}</p>
                    <button 
                      onClick={() => handleResolve(alert.id)}
                      className="text-primary text-[10px] font-black uppercase hover:underline flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[14px]">done_all</span>
                      Resolve
                    </button>
                  </div>
                </div>
              </div>
            )) : (
              <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-800">
                <span className="material-symbols-outlined text-emerald-500 text-3xl mb-2">verified_user</span>
                <p className="text-slate-500 text-xs font-bold">Area Secure</p>
              </div>
            )}
          </div>
        </div>

        {/* Center/Right: History Table */}
        <div className="lg:col-span-9 flex flex-col gap-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="p-4 md:p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <h3 className="font-bold text-base md:text-lg">Alert Resolution History</h3>
              <div className="flex gap-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{historyAlerts.length} Resolved</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[600px]">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 text-[10px] uppercase font-black tracking-widest">
                    <th className="px-4 md:px-6 py-4">Status</th>
                    <th className="px-4 md:px-6 py-4">Animal</th>
                    <th className="px-4 md:px-6 py-4">Camera</th>
                    <th className="px-4 md:px-6 py-4">Track ID</th>
                    <th className="px-4 md:px-6 py-4">Speed/Mvmnt</th>
                    <th className="px-4 md:px-6 py-4">Location</th>
                    <th className="px-4 md:px-6 py-4 text-right">Detection Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {historyAlerts.map((alert) => (
                    <tr key={alert.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 md:px-6 py-4">
                        <span className="flex items-center gap-1.5 text-emerald-600 font-black text-[10px] uppercase">
                          <span className="material-symbols-outlined text-[14px]">check_circle</span> RESOLVED
                        </span>
                      </td>
                      <td className="px-4 md:px-6 py-4 text-sm font-bold text-slate-900 dark:text-white">{alert.animal_type || alert.type}</td>
                      <td className="px-4 md:px-6 py-4 text-xs font-bold">{alert.camera_name || '—'}</td>
                      <td className="px-4 md:px-6 py-4 text-[10px] font-mono text-slate-500">{alert.track_id || '—'}</td>
                      <td className="px-4 md:px-6 py-4">
                        <p className="text-[10px] font-black text-primary">{alert.speed || '—'}</p>
                        <p className="text-[9px] text-slate-400 uppercase font-bold">{alert.movement || '—'}</p>
                      </td>
                      <td className="px-4 md:px-6 py-4 text-xs font-medium">{alert.location}</td>
                      <td className="px-4 md:px-6 py-4 text-right">
                        <p className="text-xs font-bold">{new Date(alert.detection_time || alert.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                        <p className="text-[9px] text-slate-400 font-mono">#{alert.id.slice(0, 8)}</p>
                      </td>
                    </tr>
                  ))}
                  {historyAlerts.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">No historical data available</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
