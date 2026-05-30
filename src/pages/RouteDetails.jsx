import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { MapContainer, TileLayer, Polyline, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import { ArrowLeft, Zap, MapPin, List, Map, Check, Gauge, Cloud, Clock, ChevronRight } from 'lucide-react'
import { Switch } from '../components/ui/switch'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || ''

const ROUTE_COLORS = {
  '833LTD': { bg: '#2563eb', text: '#ffffff' },
  '91LTD': { bg: '#ef4444', text: '#ffffff' },
  '42A': { bg: '#eab308', text: '#171717' },
  'C59': { bg: '#22c55e', text: '#ffffff' },
}

function getRouteColor(routeId) {
  return ROUTE_COLORS[routeId] || { bg: '#737373', text: '#ffffff' }
}

const STOP_ICONS = {}
function getStopIcon(index, isFirst, isLast, isSelected) {
  const key = `${index}-${isFirst}-${isLast}-${isSelected}`
  if (STOP_ICONS[key]) return STOP_ICONS[key]
  const color = isSelected ? '#16a34a' : isFirst ? '#2563eb' : isLast ? '#ef4444' : '#171717'
  const size = isSelected ? 32 : 28
  const icon = L.divIcon({
    className: 'custom-stop-icon',
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${color};border:2px solid white;
      box-shadow:0 1px 4px rgba(0,0,0,0.2);
      display:flex;align-items:center;justify-content:center;
      color:white;font-weight:700;font-size:${isSelected ? 13 : 12}px;
      font-family:'IBM Plex Sans',sans-serif;
    ">${isSelected ? '\u2713' : index + 1}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
  STOP_ICONS[key] = icon
  return icon
}

const TEARDROP_ICON = L.divIcon({
  className: 'bus-marker',
  html: `<div style="
    width:20px;height:20px;border-radius:50% 50% 50% 0;
    background:#2563eb;transform:rotate(-45deg);
    border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);
  "></div>`,
  iconSize: [20, 28],
  iconAnchor: [10, 28],
})

function formatClockTime(totalMinutes) {
  const h = Math.floor(totalMinutes / 60) % 24
  const m = totalMinutes % 60
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

function getWalkMinutes() {
  try {
    const raw = localStorage.getItem('realtime-routes-walk')
    return raw ? JSON.parse(raw).walkMinutes : null
  } catch { return null }
}

function setWalkMinutes(mins) {
  localStorage.setItem('realtime-routes-walk', JSON.stringify({ walkMinutes: mins }))
}

const WALK_OPTIONS = [
  { label: 'Under 5 min walk', value: 3 },
  { label: '5\u201310 min walk', value: 7 },
  { label: '10\u201315 min walk', value: 12 },
  { label: "I'll drive / auto", value: 5, note: 'Includes parking/wait time' },
]

function WalkTimeModal({ onSelect, onClose }) {
  const [selected, setSelected] = useState(null)
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl w-full max-w-md p-6 pb-8 shadow-xl mb-[60px]">
        <p className="text-sm font-bold text-surface-900 mb-4" style={{ fontFamily: 'Chivo, sans-serif' }}>
          How far is your home from this stop?
        </p>
        <div className="space-y-2 mb-5">
          {WALK_OPTIONS.map(opt => (
            <label key={opt.value} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
              selected === opt.value ? 'border-emerald-400 bg-emerald-50' : 'border-surface-200 hover:border-surface-300'
            }`}>
              <input type="radio" name="walk" className="sr-only"
                checked={selected === opt.value} onChange={() => setSelected(opt.value)} />
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                selected === opt.value ? 'border-emerald-500 bg-emerald-500' : 'border-surface-300'
              }`}>
                {selected === opt.value && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
              </div>
              <div>
                <p className="text-sm text-surface-900">{opt.label}</p>
                {opt.note && <p className="text-[11px] text-surface-400">{opt.note}</p>}
              </div>
            </label>
          ))}
        </div>
        <button
          disabled={selected === null}
          onClick={() => { if (selected !== null) { setWalkMinutes(selected); onSelect(selected); onClose() } }}
          className={`w-full py-3 rounded-xl text-sm font-bold transition-all ${
            selected !== null ? 'bg-surface-900 text-white hover:bg-surface-800' : 'bg-surface-200 text-surface-400 cursor-not-allowed'
          }`}
          style={{ fontFamily: 'Chivo, sans-serif' }}
        >
          Confirm
        </button>
      </div>
    </div>
  )
}

const TRAFFIC_LABELS = {
  light: { label: 'Light', color: 'text-emerald-600' },
  moderate: { label: 'Moderate', color: 'text-amber-600' },
  heavy: { label: 'Heavy', color: 'text-orange-600' },
  congested: { label: 'Congested', color: 'text-red-600' },
}

export default function RouteDetails() {
  const { routeId } = useParams()
  const navigate = useNavigate()
  const [lowDataMode, setLowDataMode] = useState(false)
  const [viewMode, setViewMode] = useState('list')
  const [selectedStopIdx, setSelectedStopIdx] = useState(null)
  const [buses, setBuses] = useState([])
  const [connectionStatus, setConnectionStatus] = useState('connecting')
  const [pinned, setPinned] = useState(false)
  const [walkMinutes, setWalkMinutesState] = useState(getWalkMinutes)
  const [showWalkModal, setShowWalkModal] = useState(false)
  const wsRef = useRef(null)
  const pollRef = useRef(null)

  const { data: route, isLoading, error } = useQuery({
    queryKey: ['route', routeId],
    queryFn: () => axios.get(`${BACKEND_URL}/api/routes/${routeId}`).then(r => r.data),
  })

  const { data: stopEtas } = useQuery({
    queryKey: ['stop-etas', routeId, buses],
    queryFn: () => axios.get(`${BACKEND_URL}/api/stop-etas/${routeId}`).then(r => r.data),
    enabled: !!routeId,
    refetchInterval: 5000,
  })

  const selectedStop = selectedStopIdx !== null && route?.stops ? route.stops[selectedStopIdx] : null
  const stopId = selectedStop?.id || route?.stops?.[0]?.id

  const { data: eta } = useQuery({
    queryKey: ['eta', routeId, stopId],
    queryFn: () => {
      if (!stopId) return null
      return axios.get(`${BACKEND_URL}/api/predict-eta/${routeId}/${stopId}`).then(r => r.data)
    },
    enabled: !!stopId,
    refetchInterval: 10000,
  })

  const activeStopIdx = selectedStopIdx ?? 0
  const { data: upcomingData, isLoading: upcomingLoading } = useQuery({
    queryKey: ['upcoming-arrivals', routeId, activeStopIdx],
    queryFn: () => axios.get(`${BACKEND_URL}/api/upcoming-arrivals/${routeId}/${activeStopIdx}`).then(r => r.data),
    enabled: !!routeId,
    refetchInterval: 15000,
  })

  useEffect(() => {
    let mounted = true

    const connectWs = () => {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const wsUrl = `${protocol}//localhost:3001/ws/bus-updates?routeId=${routeId}`
        const ws = new WebSocket(wsUrl)
        wsRef.current = ws

        ws.onopen = () => { if (mounted) setConnectionStatus('live') }
        ws.onmessage = (event) => {
          if (!mounted) return
          try {
            const data = JSON.parse(event.data)
            if (data.type === 'bus-update' && data.buses) setBuses(data.buses)
          } catch {}
        }
        ws.onclose = () => { if (mounted) { setConnectionStatus('polling'); startPolling() } }
        ws.onerror = () => ws.close()
      } catch { startPolling() }
    }

    const startPolling = () => {
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = setInterval(async () => {
        try {
          const res = await axios.get(`${BACKEND_URL}/api/buses/${routeId}`)
          if (mounted) setBuses(res.data.buses || [])
        } catch {}
      }, 10000)
    }

    connectWs()
    return () => {
      mounted = false
      if (wsRef.current) wsRef.current.close()
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [routeId])

  const handleStopTap = useCallback((idx) => {
    setSelectedStopIdx(prev => {
      const next = prev === idx ? null : idx
      if (next !== null && walkMinutes === null) setShowWalkModal(true)
      return next
    })
  }, [walkMinutes])

  const handlePin = useCallback(() => {
    if (!selectedStop || !route) return
    localStorage.setItem('realtime-routes-pinned', JSON.stringify({
      routeId, routeNumber: route.number, routeName: route.name,
      stopId: selectedStop.id, stopIndex: selectedStopIdx, stopName: selectedStop.name, pinnedAt: Date.now(),
    }))
    setPinned(true)
  }, [selectedStop, route, routeId, selectedStopIdx])

  useEffect(() => {
    if (!selectedStop) { setPinned(false); return }
    try {
      const raw = localStorage.getItem('realtime-routes-pinned')
      if (raw) { const s = JSON.parse(raw); setPinned(s.routeId === routeId && s.stopId === selectedStop.id) }
    } catch { setPinned(false) }
  }, [selectedStop, routeId])

  const busArrivesAt = useMemo(() => {
    if (!eta) return null
    return formatClockTime(new Date().getHours() * 60 + new Date().getMinutes() + eta.minutes)
  }, [eta])

  const leaveBy = useMemo(() => {
    if (!busArrivesAt || walkMinutes === null) return null
    const [time, ampm] = busArrivesAt.split(' ')
    const [h, m] = time.split(':').map(Number)
    let totalMin = (ampm === 'PM' && h !== 12 ? h + 12 : ampm === 'AM' && h === 12 ? 0 : h) * 60 + m - walkMinutes
    if (totalMin < 0) totalMin += 1440
    return formatClockTime(totalMin)
  }, [busArrivesAt, walkMinutes])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface-100 flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-surface-300 border-t-surface-900 rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !route) {
    return (
      <div className="min-h-screen bg-surface-100 flex items-center justify-center px-6">
        <div className="text-center">
          <p className="text-surface-600 mb-4">Route not found</p>
          <button onClick={() => navigate('/app')} className="text-sm text-blue-600 font-medium">Back to routes</button>
        </div>
      </div>
    )
  }

  const color = getRouteColor(routeId)
  const firstStop = route.stops?.[0]
  const displayStop = selectedStop || firstStop
  const routeBounds = route.coordinates?.length > 0 ? L.latLngBounds(route.coordinates.map(c => [c.lat, c.lng])) : null
  const mapCenter = routeBounds?.getCenter() || [18.9398, 72.8355]
  const firstBus = buses[0]
  const trafficInfo = firstBus ? TRAFFIC_LABELS[firstBus.traffic] : null

  return (
    <div className="min-h-screen bg-surface-100">
      {showWalkModal && (
        <WalkTimeModal onSelect={(m) => setWalkMinutesState(m)} onClose={() => setShowWalkModal(false)} />
      )}

      <div className="sticky top-0 z-30 bg-surface-100/95 backdrop-blur-md border-b border-surface-200">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => navigate('/app')} className="p-1 hover:bg-surface-200 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-surface-700" />
          </button>
          <div className="w-10 h-8 rounded-lg flex items-center justify-center text-[11px] font-black"
            style={{ backgroundColor: color.bg, color: color.text, fontFamily: 'Chivo, sans-serif' }}>
            {route.number}
          </div>
          <h1 className="text-base font-bold text-surface-900 truncate"
            style={{ fontFamily: 'Chivo, sans-serif' }}>{route.name}</h1>
        </div>
      </div>

      <div className="max-w-md mx-auto">
        <div className="px-5 pt-5 pb-4">
          <p className="text-[11px] font-bold text-surface-500 tracking-[0.15em] mb-2"
            style={{ fontFamily: 'Chivo, sans-serif' }}>
            NEXT BUS AT {displayStop?.name?.toUpperCase()}
          </p>
          <div className="flex items-baseline gap-1 mb-3">
            <span className="text-5xl font-black text-surface-900"
              style={{ fontFamily: 'Chivo, sans-serif', lineHeight: '1' }}>
              {eta?.minutes ?? '--'}
            </span>
            <span className="text-lg font-bold text-surface-500"
              style={{ fontFamily: 'Chivo, sans-serif' }}>min</span>
          </div>

          {firstBus && (
            <div className="flex items-center gap-4 mb-3 text-[11px]">
              <span className="flex items-center gap-1 text-surface-500">
                <Gauge className="w-3 h-3" /> {firstBus.speed} km/h
              </span>
              {trafficInfo && (
                <span className={`flex items-center gap-1 ${trafficInfo.color}`}>
                  <Cloud className="w-3 h-3" /> {trafficInfo.label}
                </span>
              )}
            </div>
          )}

          {eta?.insight && (
            <div className="bg-surface-50 rounded-xl p-3 border border-surface-200 mb-3">
              <div className="flex items-start gap-2">
                <Zap className="w-4 h-4 text-surface-700 mt-0.5 shrink-0" />
                <p className="text-xs text-surface-600 leading-relaxed">{eta.insight}</p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-surface-500 tracking-[0.1em]"
              style={{ fontFamily: 'Chivo, sans-serif' }}>CONFIDENCE:</span>
            <span className={`text-[11px] font-bold ${
              eta?.confidence >= 80 ? 'text-emerald-600' :
              eta?.confidence >= 65 ? 'text-amber-600' : 'text-red-600'
            }`} style={{ fontFamily: 'Chivo, sans-serif' }}>
              {eta?.confidence >= 80 ? 'High' : eta?.confidence >= 65 ? 'Medium' : 'Low'}
            </span>
          </div>
        </div>

        <div className="px-5 mb-4">
          <div className="flex gap-2 bg-surface-200 rounded-xl p-1">
            <button onClick={() => setViewMode('map')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'map' ? 'bg-white text-surface-900 shadow-sm' : 'text-surface-500'
              }`} style={{ fontFamily: 'Chivo, sans-serif' }}>
              <Map className="w-3.5 h-3.5" /> Map
            </button>
            <button onClick={() => setViewMode('list')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'list' ? 'bg-white text-surface-900 shadow-sm' : 'text-surface-500'
              }`} style={{ fontFamily: 'Chivo, sans-serif' }}>
              <List className="w-3.5 h-3.5" /> List
            </button>
          </div>
        </div>

        {viewMode === 'map' && (
          <div className="h-[300px] w-full">
            <MapContainer key={routeId} center={mapCenter} zoom={13}
              className="h-full w-full" zoomControl={false} attributionControl={false}>
              <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
              {route.coordinates?.length > 0 && (
                <Polyline positions={route.coordinates.map(c => [c.lat, c.lng])}
                  pathOptions={{ color: '#eab308', weight: 4, opacity: 1 }} />
              )}
              {route.stops?.map((stop, idx) => (
                <Marker key={stop.id} position={[stop.lat, stop.lng]}
                  icon={getStopIcon(idx, idx === 0, idx === route.stops.length - 1, idx === selectedStopIdx)}>
                  <Popup><div className="text-sm font-semibold">{stop.name}</div></Popup>
                </Marker>
              ))}
              {buses.map((bus) => (
                <Marker key={bus.id} position={[bus.lat, bus.lng]} icon={TEARDROP_ICON}>
                  <Popup>
                    <div className="text-sm">
                      <p className="font-semibold">Bus {bus.number}</p>
                      <p className="text-xs text-surface-500">{bus.speed} km/h &middot; {bus.traffic}</p>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        )}

        <div className="px-5 py-5">
          <p className="text-[11px] font-bold text-surface-500 tracking-[0.15em] mb-4"
            style={{ fontFamily: 'Chivo, sans-serif' }}>STOPS</p>
          {route.stops && (
            <div className="space-y-2">
              {route.stops.map((stop, idx) => {
                const isSelected = idx === selectedStopIdx
                const stopEta = stopEtas?.[idx]
                const isNext = stopEta?.status === 'upcoming' && stopEta?.etaMinutes !== null && stopEta?.etaMinutes <= 3
                const isPassed = stopEta?.status === 'passed'

                return (
                  <button key={stop.id} onClick={() => handleStopTap(idx)}
                    className={`w-full text-left rounded-xl p-4 border transition-all duration-200 ${
                      isSelected ? 'bg-emerald-50 border-emerald-300 shadow-sm' : 'bg-white border-surface-200 hover:border-surface-300'
                    }`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-emerald-500' : isPassed ? 'bg-surface-400' : isNext ? 'bg-emerald-500' : 'bg-surface-900'
                      }`}>
                        {isSelected ? (
                          <Check className="w-3.5 h-3.5 text-white" />
                        ) : (
                          <span className="text-xs font-bold text-white" style={{ fontFamily: 'Chivo, sans-serif' }}>{idx + 1}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold truncate ${
                          isSelected ? 'text-emerald-800' : isPassed ? 'text-surface-400' : 'text-surface-900'
                        }`} style={{ fontFamily: 'Chivo, sans-serif' }}>{stop.name}</p>
                        {stopEta?.busNumber && (
                          <p className="text-[10px] text-surface-400 mt-0.5">
                            Bus {stopEta.busNumber} &middot; {stopEta.busSpeed} km/h
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        {isPassed ? (
                          <span className="text-xs text-surface-400">Passed</span>
                        ) : isNext && stopEta ? (
                          <span className="text-xs font-bold text-emerald-600">{stopEta.etaMinutes} min</span>
                        ) : stopEta?.etaTime && stopEta.etaTime !== '--' ? (
                          <span className="text-xs font-mono text-surface-600">{stopEta.etaTime}</span>
                        ) : (
                          <span className="text-xs text-surface-400">--</span>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="px-5 py-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-surface-500" />
              <p className="text-[11px] font-bold text-surface-500 tracking-[0.15em]"
                style={{ fontFamily: 'Chivo, sans-serif' }}>
                UPCOMING AT {upcomingData?.stopName?.toUpperCase() || displayStop?.name?.toUpperCase()}
              </p>
            </div>
            <span className="text-[10px] text-surface-400">Live + Scheduled</span>
          </div>

          {upcomingLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-white rounded-xl p-3 border border-surface-200 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-surface-200 rounded-lg" />
                    <div className="flex-1">
                      <div className="h-3 bg-surface-200 rounded w-20 mb-1" />
                      <div className="h-2 bg-surface-100 rounded w-16" />
                    </div>
                    <div className="h-4 bg-surface-200 rounded w-10" />
                  </div>
                </div>
              ))}
            </div>
          ) : upcomingData?.arrivals?.length > 0 ? (
            <div className="space-y-2">
              {upcomingData.arrivals.map((arrival, idx) => {
                const isLive = arrival.source === 'live'
                const isFirst = idx === 0
                return (
                  <div key={idx}
                    className={`bg-white rounded-xl p-3 border transition-all ${
                      isFirst ? 'border-emerald-300 shadow-sm' : 'border-surface-200'
                    }`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black ${
                        isLive ? 'bg-emerald-500 text-white' : 'bg-surface-200 text-surface-600'
                      }`} style={{ fontFamily: 'Chivo, sans-serif' }}>
                        {isLive ? 'L' : 'S'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-surface-900 truncate"
                          style={{ fontFamily: 'Chivo, sans-serif' }}>
                          {arrival.busNumber}
                        </p>
                        <p className="text-[10px] text-surface-400">
                          {isLive ? `At ${arrival.speed || '--'} km/h` : `Departs ${arrival.scheduledDeparture || '--'}`}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-sm font-black ${isFirst ? 'text-emerald-600' : 'text-surface-700'}`}
                          style={{ fontFamily: 'Chivo, sans-serif' }}>
                          {arrival.etaMinutes} min
                        </p>
                        <p className="text-[10px] text-surface-400">{arrival.arrivalTime}</p>
                      </div>
                      {isFirst && (
                        <ChevronRight className="w-4 h-4 text-emerald-500 shrink-0" />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="bg-white rounded-xl p-4 border border-surface-200 text-center">
              <p className="text-xs text-surface-400">No upcoming buses found</p>
            </div>
          )}
        </div>
      </div>

      {selectedStop && eta && (
        <div className="fixed bottom-0 left-0 right-0 z-40">
          <div className="max-w-md mx-auto bg-white border-t border-surface-200 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] rounded-t-2xl px-5 py-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-bold text-surface-900"
                style={{ fontFamily: 'Chivo, sans-serif' }}>Board at {selectedStop.name}</p>
              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">{eta.minutes} min</span>
            </div>
            <div className="text-[13px] text-surface-600 space-y-0.5 mb-3">
              <p>Bus arrives: <span className="font-bold text-surface-900">{busArrivesAt}</span></p>
              {leaveBy ? (
                <p>Leave home by: <span className="font-bold text-surface-900">{leaveBy}</span>
                  <button onClick={() => setShowWalkModal(true)}
                    className="ml-2 text-[11px] text-surface-400 hover:text-surface-600 underline">Change</button>
                </p>
              ) : (
                <button onClick={() => setShowWalkModal(true)}
                  className="text-[11px] text-surface-400 hover:text-surface-600 underline">
                  Set your walk time to see when to leave
                </button>
              )}
            </div>
            <button onClick={handlePin} disabled={pinned}
              className={`w-full py-2.5 rounded-xl text-sm font-bold transition-all ${
                pinned ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-surface-900 text-white hover:bg-surface-800'
              }`} style={{ fontFamily: 'Chivo, sans-serif' }}>
              {pinned ? '\u2713 Pinned to home screen' : '\uD83D\uDCCC Pin to home screen'}
            </button>
          </div>
        </div>
      )}

      {!selectedStop && (
        <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-surface-200 px-5 py-2.5 z-30">
          <div className="flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${connectionStatus === 'live' ? 'bg-emerald-500 pulse-dot' : 'bg-amber-500'}`} />
              <span className="text-surface-500">{connectionStatus === 'live' ? 'Live tracking' : 'Polling'}</span>
            </div>
            <span className="text-surface-400">Made with Wooble</span>
          </div>
        </div>
      )}
    </div>
  )
}
