'use client'

import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix for default marker icons in Leaflet + Next.js
const DefaultIcon = L.icon({
  iconUrl: '/marker-icon.png',
  shadowUrl: '/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41]
})
L.Marker.prototype.options.icon = DefaultIcon

interface Entity {
  id: string
  full_name?: string
  name?: string
  latitude: number
  longitude: number
  status: string
  type?: string
  severity?: string
}

interface InteractiveMapProps {
  cameras: Entity[]
  alerts: Entity[]
  center?: [number, number]
  zoom?: number
  isMini?: boolean
}

function ChangeView({ center, zoom }: { center: [number, number], zoom: number }) {
  const map = useMap()
  useEffect(() => {
    map.setView(center, zoom)
  }, [center, zoom, map])
  return null
}

export default function InteractiveMap({ cameras, alerts, center = [26.0173, 76.5026], zoom = 13, isMini = false }: InteractiveMapProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return <div className="w-full h-full bg-slate-900 border border-slate-800 animate-pulse flex items-center justify-center text-slate-500 font-bold uppercase tracking-widest text-[10px]">Initializing Satellite Interface...</div>

  // Pulse effect for Alerts (severity based colors)
  const getAlertIcon = (severity: string) => {
    const color = severity === 'critical' ? '#ef4444' : '#f59e0b'
    return L.divIcon({
      className: 'custom-alert-marker',
      html: `<div style="background-color: ${color}; width: 12px; height: 12px; border-radius: 50%; box-shadow: 0 0 0 0 rgba(239, 68, 68, 1); animation: pulse 2s infinite;"></div>`,
      iconSize: [12, 12]
    })
  }

  const cameraIcon = (status: string) => {
    const color = status === 'online' ? '#10b981' : '#64748b'
    return L.divIcon({
      className: 'custom-camera-marker',
      html: `<div style="background-color: ${color}; width: 10px; height: 10px; border-radius: 50%; border: 2px solid white;"></div>`,
      iconSize: [10, 10]
    })
  }

  return (
    <div className={`w-full h-full ${isMini ? 'pointer-events-none' : ''}`}>
      <style>{`
        @keyframes pulse {
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
          70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
        .leaflet-container { background: #0a141c !important; }
      `}</style>
      <MapContainer 
        center={center} 
        zoom={zoom} 
        scrollWheelZoom={!isMini}
        dragging={!isMini}
        zoomControl={!isMini}
        className="w-full h-full"
      >
        <ChangeView center={center} zoom={zoom} />
        <TileLayer
          attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        />
        
        {/* Camera Markers */}
        {cameras.map((camera) => (
          camera.latitude && camera.longitude && (
            <Marker 
              key={camera.id} 
              position={[Number(camera.latitude), Number(camera.longitude)]}
              icon={cameraIcon(camera.status)}
            >
              {!isMini && (
                <Popup>
                  <div className="p-1">
                    <p className="font-bold text-slate-900 mb-1">{camera.name}</p>
                    <p className="text-[10px] uppercase font-black text-slate-400">Status: {camera.status}</p>
                  </div>
                </Popup>
              )}
            </Marker>
          )
        ))}

        {/* Alert Markers */}
        {alerts.map((alert) => (
          alert.latitude && alert.longitude && (
            <Marker 
              key={alert.id} 
              position={[Number(alert.latitude), Number(alert.longitude)]}
              icon={getAlertIcon(alert.severity || 'high')}
            >
              {!isMini && (
                <Popup>
                  <div className="p-1">
                    <p className="font-bold text-red-600 mb-1">{alert.type}</p>
                    <p className="text-[10px] uppercase font-black text-slate-400">Severity: {alert.severity}</p>
                  </div>
                </Popup>
              )}
            </Marker>
          )
        ))}
      </MapContainer>
    </div>
  )
}
