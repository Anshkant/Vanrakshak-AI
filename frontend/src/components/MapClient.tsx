'use client'

import dynamic from 'next/dynamic'

// Dynamically import the InteractiveMap component with SSR disabled
// This must be done in a Client Component in Next.js App Router
const InteractiveMap = dynamic(() => import('./InteractiveMap'), { 
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-slate-900/50 animate-pulse flex flex-col items-center justify-center text-slate-500 font-bold uppercase tracking-widest text-[10px]">
      <span className="material-symbols-outlined text-2xl mb-2 animate-spin">satellite_alt</span>
      Establishing Satellite Uplink...
    </div>
  )
})

interface MapClientProps {
  cameras: any[]
  alerts: any[]
  isMini?: boolean
  zoom?: number
}

export function MapClient(props: MapClientProps) {
  return <InteractiveMap {...props} />
}
