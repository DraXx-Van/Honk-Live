import { useState, useRef, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { Search, X, MapPin, Check } from 'lucide-react'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || ''

const ROUTE_COLORS = ['#3b82f6', '#ef4444', '#eab308', '#22c55e', '#8b5cf6', '#f97316']

const MARKER_ICON = L.divIcon({
  className: 'home-marker',
  html: `<div style="
    width:32px;height:32px;border-radius:50%;
    background:#f59e0b;border:3px solid white;
    box-shadow:0 2px 8px rgba(0,0,0,0.3);
    display:flex;align-items:center;justify-content:center;
  "><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg></div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
})

function StopIcon({ color, label }) {
  return L.divIcon({
    className: 'stop-marker',
    html: `<div style="
      width:24px;height:24px;border-radius:50%;
      background:${color};border:2px solid white;
      box-shadow:0 1px 4px rgba(0,0,0,0.3);
      display:flex;align-items:center;justify-content:center;
      color:white;font-weight:700;font-size:10px;
      font-family:'IBM Plex Sans',sans-serif;
    ">${label}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  })
}

function MapInit({ center }) {
  const map = useMap()
  useEffect(() => {
    map.setView(center, 15)
  }, [])
  return null
}

function MapClickHandler({ onPositionSelect }) {
  useMapEvents({ click(e) { onPositionSelect(e.latlng) } })
  return null
}

export default function HomeLocationPicker({ onClose, homeLocation }) {
  const [searchQuery, setSearchQuery] = useState(homeLocation?.address || '')
  const [searchResults, setSearchResults] = useState([])
  const [selectedPos, setSelectedPos] = useState(
    homeLocation ? { lat: homeLocation.lat, lng: homeLocation.lng } : null
  )
  const [selectedAddress, setSelectedAddress] = useState(homeLocation?.address || '')
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)

  const initialCenter = homeLocation ? [homeLocation.lat, homeLocation.lng] : [19.076, 72.8777]

  const { data: fullRoutes } = useQuery({
    queryKey: ['full-routes-for-picker'],
    queryFn: async () => {
      const listRes = await axios.get(`${BACKEND_URL}/api/routes`)
      const routes = listRes.data
      const results = await Promise.all(
        routes.map(r => axios.get(`${BACKEND_URL}/api/routes/${r.id}`).then(res => res.data))
      )
      return results
    },
  })

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    try {
      const params = new URLSearchParams({ q: searchQuery + ', Mumbai, India', format: 'json', limit: '5', addressdetails: '1' })
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`)
      setSearchResults(await res.json())
    } catch {
      setSearchResults([])
    }
    setSearching(false)
  }

  const handleSelectResult = (result) => {
    const pos = { lat: parseFloat(result.lat), lng: parseFloat(result.lon) }
    setSelectedPos(pos)
    const shortName = result.namedetails?.name || result.display_name.split(',').slice(0, 3).join(',')
    setSelectedAddress(shortName)
    setSearchResults([])
    setSearchQuery(shortName)
  }

  const handleMapClick = async (latlng) => {
    setSelectedPos(latlng)
    setSelectedAddress('Loading address...')
    try {
      const params = new URLSearchParams({ lat: latlng.lat, lon: latlng.lng, format: 'json', 'accept-language': 'en' })
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`)
      const data = await res.json()
      const shortName = data.namedetails?.name || data.display_name.split(',').slice(0, 3).join(',')
      setSelectedAddress(shortName)
    } catch {
      setSelectedAddress(`${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`)
    }
  }

  const handleSave = () => {
    if (!selectedPos) return
    setSaving(true)
    const homeData = { lat: selectedPos.lat, lng: selectedPos.lng, address: selectedAddress }
    localStorage.setItem('honk-home-location', JSON.stringify(homeData))
    setTimeout(() => { setSaving(false); onClose(homeData) }, 300)
  }

  return (
    <div className="fixed inset-0 z-[100] bg-surface-100 flex flex-col">
      <div className="bg-white border-b border-surface-200 px-4 py-3 flex items-center gap-3">
        <button onClick={() => onClose(null)} className="p-1 hover:bg-surface-100 rounded-lg">
          <X className="w-5 h-5 text-surface-600" />
        </button>
        <h2 className="text-sm font-bold text-surface-900 flex-1" style={{ fontFamily: 'Chivo, sans-serif' }}>
          Set Your Home Location
        </h2>
        <button onClick={handleSave} disabled={!selectedPos || saving}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
            selectedPos && !saving ? 'bg-surface-900 text-white hover:bg-surface-800' : 'bg-surface-200 text-surface-400'
          }`}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      <div className="bg-white px-4 py-3 border-b border-surface-200">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Search your home address..."
              className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-surface-100 border border-surface-200 text-sm focus:outline-none focus:border-surface-400"
            />
          </div>
          <button onClick={handleSearch} disabled={searching}
            className="px-4 py-2.5 rounded-xl bg-surface-900 text-white text-xs font-bold hover:bg-surface-800 transition-all disabled:opacity-50">
            {searching ? '...' : 'Search'}
          </button>
        </div>
        {searchResults.length > 0 && (
          <div className="mt-2 bg-white border border-surface-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
            {searchResults.map((r, i) => (
              <button key={i} onClick={() => handleSelectResult(r)}
                className="w-full text-left px-3 py-2.5 text-xs text-surface-700 hover:bg-surface-50 border-b border-surface-100 last:border-0 flex items-start gap-2">
                <MapPin className="w-3.5 h-3.5 text-surface-400 mt-0.5 shrink-0" />
                <span className="line-clamp-2">{r.display_name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 relative">
        <MapContainer
          center={initialCenter} zoom={15}
          className="h-full w-full" zoomControl={false} attributionControl={false}
        >
          <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
          <MapInit center={initialCenter} />
          <MapClickHandler onPositionSelect={handleMapClick} />
          {fullRoutes?.map((route, i) => {
            const color = ROUTE_COLORS[i % ROUTE_COLORS.length]
            return (
              <div key={route.id}>
                {route.coordinates?.length > 1 && (
                  <Polyline
                    positions={route.coordinates.map(c => [c.lat, c.lng])}
                    pathOptions={{ color, weight: 4, opacity: 0.8 }}
                  />
                )}
                {route.stops?.map((stop, sIdx) => (
                  <Marker key={stop.id} position={[stop.lat, stop.lng]} icon={StopIcon({ color, label: sIdx + 1 })}>
                    <Popup><div className="text-xs font-semibold">{stop.name}</div></Popup>
                  </Marker>
                ))}
              </div>
            )
          })}
          {selectedPos && <Marker position={[selectedPos.lat, selectedPos.lng]} icon={MARKER_ICON} />}
        </MapContainer>

        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full pointer-events-none z-[1000]">
          <div className="w-8 h-8 rounded-full bg-amber-500 border-2 border-white shadow-lg flex items-center justify-center">
            <MapPin className="w-4 h-4 text-white" />
          </div>
          <div className="w-2 h-2 bg-amber-500 rounded-full mx-auto -mt-0.5" />
        </div>

        {selectedAddress && (
          <div className="absolute bottom-4 left-4 right-4 bg-white rounded-xl p-3 shadow-lg border border-surface-200 flex items-center gap-3 z-[1000]">
            <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
              <Check className="w-4 h-4 text-amber-600" />
            </div>
            <p className="text-xs text-surface-700 line-clamp-2 flex-1">{selectedAddress}</p>
          </div>
        )}
      </div>
    </div>
  )
}
