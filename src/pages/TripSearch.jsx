import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { ArrowLeft, ChevronDown, Search, Gauge, Cloud, Navigation, Clock, ChevronRight, Bus } from 'lucide-react'

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

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function getTimeOfDayFactor() {
  const hour = new Date().getHours()
  if (hour >= 8 && hour < 10) return 1.4
  if (hour >= 17 && hour < 20) return 1.45
  if (hour >= 10 && hour < 17) return 1.15
  return 1.0
}

function formatClockTime(totalMinutes) {
  const h = Math.floor(totalMinutes / 60) % 24
  const m = totalMinutes % 60
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

const TRAFFIC_LABELS = {
  light: { label: 'Light', color: 'text-emerald-600' },
  moderate: { label: 'Moderate', color: 'text-amber-600' },
  heavy: { label: 'Heavy', color: 'text-orange-600' },
  congested: { label: 'Congested', color: 'text-red-600' },
}

export default function TripSearch() {
  const { routeId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const fromParam = searchParams.get('from')
  const initialFrom = fromParam !== null ? (() => { const n = parseInt(fromParam); return isNaN(n) ? null : n })() : null
  const [fromIdx, setFromIdx] = useState(initialFrom)
  const [toIdx, setToIdx] = useState(null)
  const [buses, setBuses] = useState([])
  const [showFromDrop, setShowFromDrop] = useState(false)
  const [showToDrop, setShowToDrop] = useState(false)
  const wsRef = useRef(null)

  const { data: route, isLoading } = useQuery({
    queryKey: ['route', routeId],
    queryFn: () => axios.get(`${BACKEND_URL}/api/routes/${routeId}`).then(r => r.data),
  })

  useEffect(() => {
    let mounted = true
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsHost = BACKEND_URL ? new URL(BACKEND_URL).host : window.location.host
      const ws = new WebSocket(`${protocol}//${wsHost}/ws/bus-updates?routeId=${routeId}`)
      wsRef.current = ws
      ws.onmessage = (event) => {
        if (!mounted) return
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'bus-update' && data.buses) setBuses(data.buses)
        } catch {}
      }
      ws.onerror = () => ws.close()
      ws.onclose = () => {
        if (mounted) {
          const poll = setInterval(async () => {
            try {
              const res = await axios.get(`${BACKEND_URL}/api/buses/${routeId}`)
              if (mounted) setBuses(res.data.buses || [])
            } catch {}
          }, 10000)
          wsRef.current = { close: () => clearInterval(poll) }
        }
      }
    } catch {
      const poll = setInterval(async () => {
        try {
          const res = await axios.get(`${BACKEND_URL}/api/buses/${routeId}`)
          if (mounted) setBuses(res.data.buses || [])
        } catch {}
      }, 10000)
      wsRef.current = { close: () => clearInterval(poll) }
    }
    return () => { mounted = false; if (wsRef.current) wsRef.current.close() }
  }, [routeId])

  const availableToStops = useMemo(() => {
    if (!route?.stops || fromIdx === null) return []
    return route.stops.slice(fromIdx + 1)
  }, [route, fromIdx])

  const availableFromStops = useMemo(() => {
    return route?.stops || []
  }, [route])

  const filteredBuses = useMemo(() => {
    if (!route?.stops || fromIdx === null || toIdx === null) return []
    const timeFactor = getTimeOfDayFactor()

    return buses
      .map(bus => {
        const busStopIdx = Math.floor((bus.progress || 0) * route.stops.length)
        if (busStopIdx >= fromIdx) return null

        const fromStop = route.stops[fromIdx]
        const toStop = route.stops[toIdx]
        const distToFrom = haversineDistance(bus.lat, bus.lng, fromStop.lat, fromStop.lng)
        const distFromTo = haversineDistance(fromStop.lat, fromStop.lng, toStop.lat, toStop.lng)
        const busSpeed = bus.speed || 25
        const etaToFrom = Math.round(Math.max(1, (distToFrom / busSpeed) * 60 * timeFactor))
        const etaToTo = Math.round(Math.max(1, etaToFrom + (distFromTo / busSpeed) * 60 * timeFactor))
        const confidence = bus.speed >= 20 ? 90 : bus.speed >= 15 ? 75 : 60

        return {
          ...bus,
          etaToFrom,
          etaToTo,
          confidence,
          traffic: bus.traffic || 'moderate',
        }
      })
      .filter(Boolean)
      .sort((a, b) => a.etaToFrom - b.etaToFrom)
  }, [buses, route, fromIdx, toIdx])

  const stopCoordMap = useMemo(() => {
    if (!route?.stops || !route?.coordinates?.length) return {}
    const coords = route.coordinates
    const totalLen = coords.length
    const map = {}
    route.stops.forEach((stop, idx) => {
      let minDist = Infinity
      let bestI = Math.round((idx / route.stops.length) * (totalLen - 1))
      for (let i = 0; i < totalLen; i++) {
        const d = haversineDistance(stop.lat, stop.lng, coords[i].lat, coords[i].lng)
        if (d < minDist) {
          minDist = d
          bestI = i
        }
      }
      map[idx] = bestI
    })
    return map
  }, [route])

  const allBusesWithInfo = useMemo(() => {
    if (!route?.stops) return []
    const timeFactor = getTimeOfDayFactor()
    return buses
      .map(bus => {
        const busProgress = bus.progress || 0
        const coordIdx = busProgress * (route.coordinates?.length - 1 || 1)

        let bestStopIdx = 0
        let minDist = Infinity
        route.stops.forEach((stop, idx) => {
          const d = haversineDistance(bus.lat, bus.lng, stop.lat, stop.lng)
          if (d < minDist) {
            minDist = d
            bestStopIdx = idx
          }
        })

        const busStopName = route.stops[bestStopIdx]?.name || 'Unknown'
        const lastStop = route.stops[route.stops.length - 1]?.name || ''
        const progressPct = Math.round(busProgress * 100)

        let etaToFrom = null
        if (fromIdx !== null) {
          const fromStop = route.stops[fromIdx]
          const dist = haversineDistance(bus.lat, bus.lng, fromStop.lat, fromStop.lng)
          const busSpeed = bus.speed || 25
          etaToFrom = Math.round(Math.max(1, (dist / busSpeed) * 60 * timeFactor))
        }

        return {
          ...bus,
          busStopName,
          busStopIdx: bestStopIdx,
          lastStop,
          progressPct,
          etaToFrom,
        }
      })
      .sort((a, b) => {
        if (fromIdx !== null && a.etaToFrom !== null && b.etaToFrom !== null) {
          return a.etaToFrom - b.etaToFrom
        }
        return 0
      })
  }, [buses, route, fromIdx])

  const bestEta = useMemo(() => {
    if (fromIdx === null || allBusesWithInfo.length === 0) return null
    return allBusesWithInfo.reduce((min, b) => b.etaToFrom !== null && (min === null || b.etaToFrom < min) ? b.etaToFrom : min, null)
  }, [allBusesWithInfo, fromIdx])

  const displayStopIdx = fromIdx !== null ? fromIdx : 0
  const { data: upcomingData, isLoading: upcomingLoading } = useQuery({
    queryKey: ['upcoming-arrivals', routeId, displayStopIdx],
    queryFn: () => axios.get(`${BACKEND_URL}/api/upcoming-arrivals/${routeId}/${displayStopIdx}`).then(r => r.data),
    enabled: !!routeId,
    refetchInterval: 15000,
  })

  const color = getRouteColor(routeId)

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface-100 flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-surface-300 border-t-surface-900 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface-100">
      <div className="sticky top-0 z-30 bg-surface-100/95 backdrop-blur-md border-b border-surface-200">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => navigate('/app')} className="p-1 hover:bg-surface-200 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-surface-700" />
          </button>
          <div className="w-10 h-8 rounded-lg flex items-center justify-center text-[11px] font-black"
            style={{ backgroundColor: color.bg, color: color.text, fontFamily: 'Chivo, sans-serif' }}>
            {route?.number}
          </div>
          <h1 className="text-base font-bold text-surface-900 truncate"
            style={{ fontFamily: 'Chivo, sans-serif' }}>{route?.name}</h1>
        </div>
      </div>

      <div className="max-w-md mx-auto px-5 pt-6 pb-24">
        <p className="text-[11px] font-bold text-surface-500 tracking-[0.15em] mb-4"
          style={{ fontFamily: 'Chivo, sans-serif' }}>PLAN YOUR TRIP</p>

        {/* From Dropdown */}
        <div className="mb-3 relative">
          <label className="text-[11px] font-bold text-surface-500 tracking-[0.1em] mb-1 block"
            style={{ fontFamily: 'Chivo, sans-serif' }}>FROM</label>
          <button onClick={() => { setShowFromDrop(!showFromDrop); setShowToDrop(false) }}
            className="w-full bg-white border border-surface-200 rounded-xl p-3 flex items-center justify-between hover:border-surface-300 transition-all">
            <span className={`text-sm ${fromIdx !== null ? 'text-surface-900 font-semibold' : 'text-surface-400'}`}
              style={{ fontFamily: 'Chivo, sans-serif' }}>
              {fromIdx !== null ? route.stops[fromIdx].name : 'Select boarding stop'}
            </span>
            <ChevronDown className="w-4 h-4 text-surface-400" />
          </button>
          {showFromDrop && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-surface-200 rounded-xl shadow-lg z-20 max-h-60 overflow-y-auto">
              {availableFromStops.map((stop, idx) => (
                <button key={stop.id} onClick={() => { setFromIdx(idx); setToIdx(null); setShowFromDrop(false) }}
                  className="w-full text-left px-4 py-3 text-sm hover:bg-surface-50 border-b border-surface-100 last:border-0"
                  style={{ fontFamily: 'Chivo, sans-serif' }}>
                  <span className="text-surface-400 mr-2">{idx + 1}.</span> {stop.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* To Dropdown */}
        <div className="mb-5 relative">
          <label className="text-[11px] font-bold text-surface-500 tracking-[0.1em] mb-1 block"
            style={{ fontFamily: 'Chivo, sans-serif' }}>TO</label>
          <button onClick={() => { setShowToDrop(!showToDrop); setShowFromDrop(false) }}
            disabled={fromIdx === null}
            className={`w-full bg-white border rounded-xl p-3 flex items-center justify-between transition-all ${
              fromIdx === null ? 'border-surface-100 cursor-not-allowed' : 'border-surface-200 hover:border-surface-300'
            }`}>
            <span className={`text-sm ${toIdx !== null ? 'text-surface-900 font-semibold' : 'text-surface-400'}`}
              style={{ fontFamily: 'Chivo, sans-serif' }}>
              {toIdx !== null ? route.stops[toIdx].name : fromIdx !== null ? 'Select destination' : 'Select FROM first'}
            </span>
            <ChevronDown className="w-4 h-4 text-surface-400" />
          </button>
          {showToDrop && availableToStops.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-surface-200 rounded-xl shadow-lg z-20 max-h-60 overflow-y-auto">
              {availableToStops.map((stop) => {
                const origIdx = route.stops.findIndex(s => s.id === stop.id)
                return (
                  <button key={stop.id} onClick={() => { setToIdx(origIdx); setShowToDrop(false) }}
                    className="w-full text-left px-4 py-3 text-sm hover:bg-surface-50 border-b border-surface-100 last:border-0"
                    style={{ fontFamily: 'Chivo, sans-serif' }}>
                    <span className="text-surface-400 mr-2">{origIdx + 1}.</span> {stop.name}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Buses View */}
        {buses.length > 0 && fromIdx === null && toIdx === null && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Search className="w-4 h-4 text-surface-500" />
              <p className="text-[11px] font-bold text-surface-500 tracking-[0.15em]"
                style={{ fontFamily: 'Chivo, sans-serif' }}>
                LIVE BUSES ON THIS ROUTE
              </p>
            </div>
            <div className="space-y-3">
              {allBusesWithInfo.slice(0, 10).map(bus => (
                <button key={bus.id} onClick={() => navigate(`/app/track/${routeId}/${bus.id}`)}
                  className="w-full text-left bg-white rounded-2xl p-4 border border-surface-200 shadow-sm hover:shadow-md transition-all active:scale-[0.98]">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-bold text-surface-900" style={{ fontFamily: 'Chivo, sans-serif' }}>
                      Bus {bus.number}
                    </p>
                    <span className={`text-[10px] font-bold ${(TRAFFIC_LABELS[bus.traffic] || TRAFFIC_LABELS.moderate).color}`}>
                      {(TRAFFIC_LABELS[bus.traffic] || TRAFFIC_LABELS.moderate).label}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[12px] mb-3">
                    <div>
                      <p className="text-surface-400">Currently at</p>
                      <p className="font-bold text-surface-900">{bus.busStopName}</p>
                    </div>
                    <div>
                      <p className="text-surface-400">Heading to</p>
                      <p className="font-bold text-surface-900">{bus.lastStop}</p>
                    </div>
                    <div>
                      <p className="text-surface-400">Speed</p>
                      <p className="font-bold text-surface-900">{bus.speed} km/h</p>
                    </div>
                    <div>
                      <p className="text-surface-400">Progress</p>
                      <p className="font-bold text-surface-900">{bus.progressPct}%</p>
                    </div>
                  </div>
                  <div className="w-full bg-surface-100 rounded-full h-2 overflow-hidden mb-3">
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${bus.progressPct}%`, backgroundColor: color.bg }} />
                  </div>
                  <div className="py-2 rounded-xl bg-surface-900 text-white text-center text-xs font-bold"
                    style={{ fontFamily: 'Chivo, sans-serif' }}>
                    Track This Bus
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {buses.length > 0 && fromIdx !== null && toIdx === null && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Search className="w-4 h-4 text-surface-500" />
              <p className="text-[11px] font-bold text-surface-500 tracking-[0.15em]"
                style={{ fontFamily: 'Chivo, sans-serif' }}>
                BUSES TO YOUR STOP
              </p>
            </div>
            <div className="space-y-3">
              {allBusesWithInfo.map(bus => {
                const isBest = bus.etaToFrom === bestEta && bestEta !== null
                return (
                  <button key={bus.id} onClick={() => navigate(`/app/track/${routeId}/${bus.id}?from=${fromIdx}&to=${route.stops.length - 1}`)}
                    className={`w-full text-left bg-white rounded-2xl p-4 border shadow-sm hover:shadow-md transition-all active:scale-[0.98] ${
                      isBest ? 'border-emerald-400 ring-1 ring-emerald-400' : 'border-surface-200'
                    }`}>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-bold text-surface-900" style={{ fontFamily: 'Chivo, sans-serif' }}>
                        Bus {bus.number}
                      </p>
                      <span className={`text-[10px] font-bold ${(TRAFFIC_LABELS[bus.traffic] || TRAFFIC_LABELS.moderate).color}`}>
                        {(TRAFFIC_LABELS[bus.traffic] || TRAFFIC_LABELS.moderate).label}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[12px] mb-3">
                      <div>
                        <p className="text-surface-400">Currently at</p>
                        <p className="font-bold text-surface-900">{bus.busStopName}</p>
                      </div>
                      <div>
                        <p className="text-surface-400">Heading to</p>
                        <p className="font-bold text-surface-900">{bus.lastStop}</p>
                      </div>
                      <div>
                        <p className="text-surface-400">Speed</p>
                        <p className="font-bold text-surface-900">{bus.speed} km/h</p>
                      </div>
                      {bus.etaToFrom !== null && (
                        <div>
                          <p className="text-surface-400">Reaches your stop</p>
                          <p className="font-bold text-emerald-600">{bus.etaToFrom} min</p>
                        </div>
                      )}
                    </div>
                    <div className="w-full bg-surface-100 rounded-full h-2 overflow-hidden mb-3">
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${bus.progressPct}%`, backgroundColor: color.bg }} />
                    </div>
                    <div className="py-2 rounded-xl bg-surface-900 text-white text-center text-xs font-bold"
                      style={{ fontFamily: 'Chivo, sans-serif' }}>
                      Track This Bus
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Find Buses - existing behavior when both selected */}
        {fromIdx !== null && toIdx !== null && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Search className="w-4 h-4 text-surface-500" />
              <p className="text-[11px] font-bold text-surface-500 tracking-[0.15em]"
                style={{ fontFamily: 'Chivo, sans-serif' }}>
                AVAILABLE BUSES ({filteredBuses.length})
              </p>
            </div>

            {filteredBuses.length === 0 ? (
              <div className="text-center py-8 bg-white rounded-2xl border border-surface-200">
                <p className="text-surface-500 text-sm">No buses available for this trip</p>
                <p className="text-surface-400 text-xs mt-1">All buses have passed your boarding stop</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredBuses.map(bus => {
                  const traffic = TRAFFIC_LABELS[bus.traffic] || TRAFFIC_LABELS.moderate
                  return (
                    <div key={bus.id} className="bg-white rounded-2xl p-4 border border-surface-200 shadow-sm">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-bold text-surface-900"
                          style={{ fontFamily: 'Chivo, sans-serif' }}>
                          Bus {bus.number}
                        </p>
                        <span className={`text-[10px] font-bold ${traffic.color}`}>{traffic.label}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[12px] mb-3">
                        <div>
                          <p className="text-surface-400">Arrives your stop</p>
                          <p className="font-bold text-emerald-600">{bus.etaToFrom} min</p>
                        </div>
                        <div>
                          <p className="text-surface-400">Reaches destination</p>
                          <p className="font-bold text-surface-900">{bus.etaToTo} min</p>
                        </div>
                        <div>
                          <p className="text-surface-400">Speed</p>
                          <p className="font-bold text-surface-900">{bus.speed} km/h</p>
                        </div>
                        <div>
                          <p className="text-surface-400">Confidence</p>
                          <p className={`font-bold ${bus.confidence >= 80 ? 'text-emerald-600' : bus.confidence >= 65 ? 'text-amber-600' : 'text-red-600'}`}>
                            {bus.confidence >= 80 ? 'High' : bus.confidence >= 65 ? 'Medium' : 'Low'}
                          </p>
                        </div>
                      </div>
                      <button onClick={() => navigate(`/app/track/${routeId}/${bus.id}?from=${fromIdx}&to=${toIdx}`)}
                        className="w-full py-2.5 rounded-xl text-sm font-bold bg-surface-900 text-white hover:bg-surface-800 transition-all"
                        style={{ fontFamily: 'Chivo, sans-serif' }}>
                        Track This Bus
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-surface-500" />
              <p className="text-[11px] font-bold text-surface-500 tracking-[0.15em]"
                style={{ fontFamily: 'Chivo, sans-serif' }}>
                UPCOMING AT {upcomingData?.stopName?.toUpperCase() || route?.stops?.[displayStopIdx]?.name?.toUpperCase()}
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
                const destIdx = toIdx ?? (route?.stops?.length || 1) - 1
                const trackUrl = isLive
                  ? `/app/track/${routeId}/${arrival.busId}?from=${displayStopIdx}&to=${destIdx}&halted=1`
                  : `/app/track/${routeId}/scheduled-${routeId}-${idx}?from=${displayStopIdx}&to=${destIdx}&scheduled=1&busNumber=${encodeURIComponent(arrival.busNumber)}&departTime=${encodeURIComponent(arrival.scheduledDeparture || '')}`
                const CardWrapper = 'button'

                return (
                  <CardWrapper key={idx}
                    onClick={() => navigate(trackUrl)}
                    className={`w-full text-left bg-white rounded-xl p-3 border transition-all ${
                      isFirst ? 'border-emerald-300 shadow-sm' : 'border-surface-200'
                    } active:scale-[0.98] hover:shadow-md cursor-pointer`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black ${
                        isLive ? 'bg-emerald-500 text-white' : 'bg-amber-100 text-amber-700'
                      }`} style={{ fontFamily: 'Chivo, sans-serif' }}>
                        {isLive ? <Bus className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-surface-900 truncate"
                          style={{ fontFamily: 'Chivo, sans-serif' }}>
                          {arrival.busNumber}
                        </p>
                        {isLive ? (
                          <p className="text-[10px] text-emerald-600 font-medium">
                            Heading to your stop &middot; {arrival.speed || '--'} km/h
                          </p>
                        ) : (
                          <p className="text-[10px] text-amber-600 font-medium">
                            Halts at stop &middot; Departs {arrival.scheduledDeparture || '--'}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-sm font-black ${isFirst ? 'text-emerald-600' : 'text-surface-700'}`}
                          style={{ fontFamily: 'Chivo, sans-serif' }}>
                          {arrival.etaMinutes} min
                        </p>
                        <p className="text-[10px] text-surface-400">{arrival.arrivalTime}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-surface-400 shrink-0" />
                    </div>
                  </CardWrapper>
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
    </div>
  )
}
