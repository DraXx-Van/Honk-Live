import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { MapContainer, TileLayer, Polyline, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import { ArrowLeft, Check, Gauge, Cloud, MapPin, Zap, Ticket, Bus } from 'lucide-react'
import { calculateLeaveTime, formatClockTime, getWalkMinutes } from '../utils/leaveTime'

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
        <button disabled={selected === null}
          onClick={() => { if (selected !== null) { setWalkMinutes(selected); onSelect(selected); onClose() } }}
          className={`w-full py-3 rounded-xl text-sm font-bold transition-all ${
            selected !== null ? 'bg-surface-900 text-white hover:bg-surface-800' : 'bg-surface-200 text-surface-400 cursor-not-allowed'
          }`} style={{ fontFamily: 'Chivo, sans-serif' }}>
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

export default function BusTracker() {
  const { routeId, busId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const fromParam = searchParams.get('from')
  const toParam = searchParams.get('to')
  const fromIdx = fromParam !== null ? parseInt(fromParam) : null
  const toIdx = toParam !== null ? parseInt(toParam) : null
  const isScheduled = searchParams.get('scheduled') === '1'
  const isHalted = searchParams.get('halted') === '1'
  const scheduledBusNumber = searchParams.get('busNumber') || ''
  const scheduledDepartTime = searchParams.get('departTime') || ''

  const [buses, setBuses] = useState([])
  const [homeLocation] = useState(() => {
    try {
      const raw = localStorage.getItem('honk-home-location')
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  })
  const [walkMinutes, setWalkMinutesState] = useState(() => {
    const saved = getWalkMinutes()
    if (saved !== null) return saved
    try {
      const raw = localStorage.getItem('honk-home-location')
      if (raw) {
        const home = JSON.parse(raw)
        if (home?.lat && home?.lng) return 5
      }
    } catch {}
    return null
  })
  const [showWalkModal, setShowWalkModal] = useState(false)
  const [isPinned, setIsPinned] = useState(() => {
    try {
      const raw = localStorage.getItem('realtime-routes-pinned')
      if (!raw) return false
      const data = JSON.parse(raw)
      return data.busId === busId && data.routeId === routeId
    } catch { return false }
  })
  const [simSpeed, setSimSpeed] = useState(10)
  const [trackerState, setTrackerState] = useState(() => {
    try {
      const raw = localStorage.getItem('realtime-routes-riding')
      if (raw) {
        const data = JSON.parse(raw)
        if (data.busId === busId && data.routeId === routeId) return 'riding'
      }
    } catch {}
    return 'approaching'
  })
  const [showCatchModal, setShowCatchModal] = useState(false)
  const [paymentStep, setPaymentStep] = useState(null)
  const [confirmedTicket, setConfirmedTicket] = useState(null)
  const [upiId, setUpiId] = useState('')
  const [selectedApp, setSelectedApp] = useState(null)
  const [haltedMode, setHaltedMode] = useState(isHalted && !isScheduled)
  const wsRef = useRef(null)
  const speedHistoryRef = useRef([])
  const prevFromEtaRef = useRef(null)
  const initialMountRef = useRef(true)
  const justTransitionedFromHaltedRef = useRef(false)
  const prevBusProgressRef = useRef(null)

  const { data: route, isLoading } = useQuery({
    queryKey: ['route', routeId],
    queryFn: () => axios.get(`${BACKEND_URL}/api/routes/${routeId}`).then(r => r.data),
  })

  useEffect(() => {
    const fetchSpeed = () => axios.get(`${BACKEND_URL}/api/sim-speed`).then(r => setSimSpeed(r.data.speed)).catch(() => {})
    fetchSpeed()
    const interval = setInterval(fetchSpeed, 3000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    let mounted = true
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const ws = new WebSocket(`${protocol}//localhost:3001/ws/bus-updates?routeId=${routeId}`)
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
          }, 2000)
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

  const thisBus = useMemo(() => buses.find(b => b.id === busId), [buses, busId])

  const stopProgressMap = useMemo(() => {
    if (!route?.stops || !route?.coordinates?.length) return {}
    const coords = route.coordinates
    const totalLen = coords.length
    const map = {}
    route.stops.forEach((stop, idx) => {
      let minDist = Infinity
      let bestT = idx / route.stops.length
      for (let i = 0; i < totalLen; i++) {
        const d = haversineDistance(stop.lat, stop.lng, coords[i].lat, coords[i].lng)
        if (d < minDist) {
          minDist = d
          bestT = i / (totalLen - 1)
        }
      }
      map[idx] = bestT
    })
    return map
  }, [route])

  const stopEtas = useMemo(() => {
    if (!route?.stops || !thisBus) return []
    const timeFactor = getTimeOfDayFactor()
    const busProgress = thisBus.progress || 0
    const rawSpeed = thisBus.speed || 25

    speedHistoryRef.current.push(rawSpeed)
    if (speedHistoryRef.current.length > 10) speedHistoryRef.current.shift()
    const busSpeed = speedHistoryRef.current.reduce((a, b) => a + b, 0) / speedHistoryRef.current.length

    return route.stops.map((stop, idx) => {
      const stopProgress = stopProgressMap[idx] ?? idx / route.stops.length
      const isPassed = stopProgress < busProgress - 0.01

      if (isPassed) {
        return { status: 'passed', etaMinutes: null, etaTime: 'Passed' }
      }

      const dist = haversineDistance(thisBus.lat, thisBus.lng, stop.lat, stop.lng)
      const eta = Math.max(1, (dist / busSpeed) * 60 * timeFactor)
      const arrivalTime = new Date(Date.now() + eta * 60000)
      const h = arrivalTime.getHours()
      const m = arrivalTime.getMinutes()
      const ampm = h >= 12 ? 'PM' : 'AM'
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h

      return {
        status: idx === fromIdx ? 'from' : idx === toIdx ? 'to' : 'upcoming',
        etaMinutes: Math.round(eta),
        etaTime: `${h12}:${String(m).padStart(2, '0')} ${ampm}`,
        etaAbsoluteMinutes: h * 60 + m,
      }
    })
  }, [route, thisBus, fromIdx, toIdx, stopProgressMap])

  const fromStop = route?.stops?.[fromIdx]
  const toStop = route?.stops?.[toIdx]
  const fromEta = useMemo(() => {
    const raw = stopEtas[fromIdx]
    if (!raw?.etaMinutes) return raw
    const eta = raw.etaMinutes
    const prev = prevFromEtaRef.current
    if (prev !== null && eta > prev * 2) {
      prevFromEtaRef.current = eta
      return raw
    }
    const clamped = prev !== null ? Math.min(prev, eta) : eta
    prevFromEtaRef.current = clamped
    if (clamped === eta) return raw
    return { ...raw, etaMinutes: clamped }
  }, [stopEtas, fromIdx])
  const toEta = stopEtas[toIdx]

  useEffect(() => {
    if (walkMinutes === null && homeLocation && fromStop) {
      const dist = haversineDistance(homeLocation.lat, homeLocation.lng, fromStop.lat, fromStop.lng)
      const walkMin = Math.max(1, Math.round((dist / 5) * 60))
      setWalkMinutesState(walkMin)
      setWalkMinutes(walkMin)
    } else if (walkMinutes === null && !homeLocation && fromStop) {
      setShowWalkModal(true)
    }
  }, [homeLocation, fromStop])

  const busArrivalMinutes = fromEta?.etaAbsoluteMinutes ?? null
  const busArrivesAt = fromEta?.etaTime ?? null

  const leaveBy = useMemo(() => {
    if (busArrivalMinutes === null || walkMinutes === null) return null
    return calculateLeaveTime(busArrivalMinutes, walkMinutes)
  }, [busArrivalMinutes, walkMinutes])

  const color = getRouteColor(routeId)
  const routeBounds = route?.coordinates?.length > 0 ? L.latLngBounds(route.coordinates.map(c => [c.lat, c.lng])) : null
  const mapCenter = routeBounds?.getCenter() || [18.9398, 72.8355]

  // Detect bus arrival at fromStop
  useEffect(() => {
    if (!thisBus || fromIdx === null || trackerState !== 'approaching') return
    if (thisBus.state === 'completed') return
    if (haltedMode) return
    if (justTransitionedFromHaltedRef.current) return

    const busProg = thisBus.progress || 0
    const fromProg = stopProgressMap[fromIdx] ?? 0
    const hasReachedFromStop = busProg >= fromProg

    if (hasReachedFromStop) {
      if (initialMountRef.current) {
        initialMountRef.current = false
        setTrackerState('arrived')
        return
      }
      setShowCatchModal(true)
      setTrackerState('arrived')
      localStorage.setItem(`realtime-routes-catch-shown-${routeId}`, Date.now().toString())
    }
    initialMountRef.current = false
  }, [thisBus, fromIdx, trackerState, route, stopProgressMap])

  // Halted mode: auto-transition when bus completes route and restarts
  useEffect(() => {
    if (!haltedMode || !thisBus) return
    const currentProg = thisBus.progress || 0
    const prevProg = prevBusProgressRef.current
    if (prevProg !== null) {
      const justRestarted = prevProg > 0.9 && currentProg < 0.1
      if (justRestarted) {
        setHaltedMode(false)
        justTransitionedFromHaltedRef.current = true
        setTimeout(() => { justTransitionedFromHaltedRef.current = false }, 5000)
        try {
          const raw = localStorage.getItem('realtime-routes-pinned')
          if (raw) {
            const data = JSON.parse(raw)
            if (data.routeId === routeId && data.halted) {
              delete data.halted
              localStorage.setItem('realtime-routes-pinned', JSON.stringify(data))
            }
          }
        } catch {}
      }
    }
    prevBusProgressRef.current = currentProg
  }, [thisBus, haltedMode])

  // Detect trip completion - bus reached user's destination
  useEffect(() => {
    if (!thisBus || toIdx === null) return
    if (trackerState !== 'riding') return

    const busProg = thisBus.progress || 0
    const toProg = stopProgressMap[toIdx] ?? 1
    const hasReachedDest = busProg >= toProg

    if (hasReachedDest) {
      setTrackerState('trip-complete')
      const ridingRaw = localStorage.getItem('realtime-routes-riding')
      if (ridingRaw) {
        try {
          const ridingData = JSON.parse(ridingRaw)
          const history = JSON.parse(localStorage.getItem('realtime-routes-trip-history') || '[]')
          history.unshift({ ...ridingData, routeNumber: route?.number || routeId, completedAt: Date.now() })
          if (history.length > 20) history.length = 20
          localStorage.setItem('realtime-routes-trip-history', JSON.stringify(history))
        } catch {}
      }
      localStorage.removeItem('realtime-routes-riding')
      localStorage.removeItem('realtime-routes-pinned')
      localStorage.removeItem(`realtime-routes-catch-shown-${routeId}`)
    }
  }, [thisBus, toIdx, trackerState, route, stopProgressMap])

  // Detect route completion
  useEffect(() => {
    if (!thisBus) return
    if (thisBus.state === 'completed' && trackerState !== 'trip-complete') {
      if (trackerState === 'riding') {
        setTrackerState('trip-complete')
        setShowCatchModal(false)
        localStorage.removeItem('realtime-routes-riding')
        localStorage.removeItem('realtime-routes-pinned')
        localStorage.removeItem(`realtime-routes-catch-shown-${routeId}`)
      }
    }
  }, [thisBus?.state, trackerState])

  // Reset tracker when bus starts new trip after completion
  useEffect(() => {
    if (!thisBus) return
    if (thisBus.state === 'moving' && trackerState === 'completed') {
      setTrackerState('approaching')
    }
  }, [thisBus?.state, trackerState])

  const prevDestEtaRef = useRef(null)

  // Trip progress (riding mode)
  const tripProgress = useMemo(() => {
    if (trackerState !== 'riding' || !thisBus || fromIdx === null || toIdx === null || !route?.stops) return null
    const fromStopObj = route.stops[fromIdx]
    const toStopObj = route.stops[toIdx]
    if (!fromStopObj || !toStopObj) return null

    const rawSpeed = thisBus.speed || 25
    speedHistoryRef.current.push(rawSpeed)
    if (speedHistoryRef.current.length > 10) speedHistoryRef.current.shift()
    const busSpeed = speedHistoryRef.current.reduce((a, b) => a + b, 0) / speedHistoryRef.current.length

    const distToDest = haversineDistance(thisBus.lat, thisBus.lng, toStopObj.lat, toStopObj.lng)
    const eta = Math.max(1, (distToDest / busSpeed) * 60 * getTimeOfDayFactor())
    let etaMin = Math.round(eta)

    const prev = prevDestEtaRef.current
    if (prev !== null && etaMin > prev * 2) {
      prevDestEtaRef.current = etaMin
    } else {
      etaMin = prev !== null ? Math.min(prev, etaMin) : etaMin
      prevDestEtaRef.current = etaMin
    }

    const busProg = thisBus.progress || 0
    const fromProg = stopProgressMap[fromIdx] ?? 0
    const toProg = stopProgressMap[toIdx] ?? 1
    const tripRange = toProg - fromProg
    const tripDone = tripRange > 0 ? Math.max(0, Math.min(1, (busProg - fromProg) / tripRange)) : 0

    return {
      etaMinutes: etaMin,
      progressPct: Math.round(tripDone * 100),
      distToDest: distToDest.toFixed(1),
    }
  }, [trackerState, thisBus, fromIdx, toIdx, route, stopProgressMap])

  const FARE = 15
  const CONVENIENCE_FEE = 2
  const TOTAL_FARE = FARE + CONVENIENCE_FEE

  function handleBuyTicket() {
    setPaymentStep('summary')
  }

  function generateTicketId() {
    return `TKT-${Date.now().toString(36).toUpperCase()}`
  }

  function generateQrData(ticketId, paymentId) {
    return `HONK-${routeId}-${fromStop?.name || ''}-${toStop?.name || ''}-${paymentId}-${ticketId}`
  }

  function handleProceedToPay() {
    setPaymentStep('payment')
  }

  function handlePayNow() {
    setPaymentStep('processing')

    setTimeout(() => {
      const paymentId = `HONK${Date.now()}`
      const ticketId = generateTicketId()

      const ticket = {
        id: ticketId,
        paymentId: paymentId,
        routeId: routeId,
        routeNumber: route?.number || routeId,
        routeName: route?.name || '',
        fromStop: fromStop?.name || '',
        toStop: toStop?.name || '',
        busId: busId,
        busNumber: thisBus?.number || busId,
        date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
        time: formatClockTime(new Date().getHours() * 60 + new Date().getMinutes()),
        fare: FARE,
        convenienceFee: CONVENIENCE_FEE,
        total: TOTAL_FARE,
        purchasedAt: Date.now(),
        qrData: generateQrData(ticketId, paymentId),
      }

      const existing = JSON.parse(localStorage.getItem('realtime-routes-tickets') || '[]')
      existing.unshift(ticket)
      if (existing.length > 50) existing.length = 50
      localStorage.setItem('realtime-routes-tickets', JSON.stringify(existing))

      if (fromIdx !== null && toIdx !== null) {
        localStorage.setItem('realtime-routes-pinned', JSON.stringify({
          busId, routeId,
          fromStop: fromStop?.name, fromStopIndex: fromIdx,
          toStop: toStop?.name, toStopIndex: toIdx,
          pinnedAt: Date.now(),
        }))
      }

      setConfirmedTicket(ticket)
      setPaymentStep('ticket')
    }, 1500)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface-100 flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-surface-300 border-t-surface-900 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface-100">
      {showWalkModal && (
        <WalkTimeModal onSelect={(m) => setWalkMinutesState(m)} onClose={() => setShowWalkModal(false)} />
      )}

      {/* Catch Bus Modal */}
      {showCatchModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="fixed inset-0 bg-black/40" />
          <div className="relative bg-white rounded-t-2xl w-full max-w-md p-6 pb-8 shadow-xl z-10 mb-[60px]">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <span className="text-xl">🚌</span>
            </div>
            <p className="text-sm font-bold text-surface-900 text-center mb-1" style={{ fontFamily: 'Chivo, sans-serif' }}>
              Bus {thisBus?.number} has arrived!
            </p>
            <p className="text-xs text-surface-500 text-center mb-5">
              At {fromStop?.name} — did you catch the bus?
            </p>
            <div className="space-y-2">
              <button onClick={() => {
                setShowCatchModal(false)
                setTrackerState('riding')
                localStorage.removeItem(`realtime-routes-catch-shown-${routeId}`)
                localStorage.setItem('realtime-routes-riding', JSON.stringify({
                  busId, routeId, busNumber: thisBus?.number,
                  fromStop: fromStop?.name, fromStopIndex: fromIdx,
                  toStop: toStop?.name, toStopIndex: toIdx,
                  startedAt: Date.now(),
                }))
              }}
                className="w-full py-3 rounded-xl text-sm font-bold bg-emerald-500 text-white hover:bg-emerald-600 transition-all"
                style={{ fontFamily: 'Chivo, sans-serif' }}>
                Yes, I'm on it!
              </button>
              <button onClick={() => { setShowCatchModal(false); setTrackerState('missed'); localStorage.removeItem(`realtime-routes-catch-shown-${routeId}`) }}
                className="w-full py-3 rounded-xl text-sm font-bold bg-surface-100 text-surface-700 hover:bg-surface-200 transition-all"
                style={{ fontFamily: 'Chivo, sans-serif' }}>
                No, I missed it
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="sticky top-0 z-30 bg-surface-100/95 backdrop-blur-md border-b border-surface-200">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => navigate(`/app/route/${routeId}`)} className="p-1 hover:bg-surface-200 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-surface-700" />
          </button>
          <div className="w-10 h-8 rounded-lg flex items-center justify-center text-[11px] font-black"
            style={{ backgroundColor: color.bg, color: color.text, fontFamily: 'Chivo, sans-serif' }}>
            {route?.number}
          </div>
          <div>
            <h1 className="text-sm font-bold text-surface-900"
              style={{ fontFamily: 'Chivo, sans-serif' }}>Bus {thisBus?.number || busId}</h1>
            <p className="text-[10px] text-surface-400">
              {fromStop?.name && toStop?.name ? `${fromStop.name} → ${toStop.name}` : route?.name || 'Tracking live'}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto">
        {/* Map */}
        <div className="h-[280px] w-full relative">
          {(thisBus || isScheduled) && (() => {
            const busLat = (isScheduled || haltedMode) ? (route?.stops?.[0]?.lat ?? 18.9398) : thisBus.lat
            const busLng = (isScheduled || haltedMode) ? (route?.stops?.[0]?.lng ?? 72.8355) : thisBus.lng
            const busLabel = isScheduled ? scheduledBusNumber : thisBus.number
            const isHaltedState = isScheduled || haltedMode
            return (
              <MapContainer key={`${routeId}-${busId}`} center={[busLat, busLng]} zoom={14}
                className="h-full w-full" zoomControl={false} attributionControl={false}>
                <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
                {route.coordinates?.length > 0 && (
                  <Polyline positions={route.coordinates.map(c => [c.lat, c.lng])}
                    pathOptions={{ color: '#eab308', weight: 4, opacity: 1 }} />
                )}
                {route.stops?.map((stop, idx) => {
                  const isFrom = idx === fromIdx
                  const isTo = idx === toIdx
                  const iconColor = isFrom ? '#16a34a' : isTo ? '#2563eb' : '#171717'
                  const icon = L.divIcon({
                    className: 'custom-stop-icon',
                    html: `<div style="
                      width:28px;height:28px;border-radius:50%;
                      background:${iconColor};border:2px solid white;
                      box-shadow:0 1px 4px rgba(0,0,0,0.2);
                      display:flex;align-items:center;justify-content:center;
                      color:white;font-weight:700;font-size:12px;
                      font-family:'IBM Plex Sans',sans-serif;
                    ">${isFrom ? 'FROM' : isTo ? 'TO' : idx + 1}</div>`,
                    iconSize: [28, 28],
                    iconAnchor: [14, 14],
                  })
                  return (
                    <Marker key={stop.id} position={[stop.lat, stop.lng]} icon={icon}>
                      <Popup><div className="text-sm font-semibold">{stop.name}</div></Popup>
                    </Marker>
                  )
                })}
                <Marker position={[busLat, busLng]}
                  icon={L.divIcon({
                    className: 'bus-marker',
                    html: `<div style="
                      width:32px;height:32px;border-radius:6px;
                      background:${isHaltedState ? '#f59e0b' : '#171717'};
                      border:2px solid white;
                      box-shadow:0 2px 8px rgba(0,0,0,0.4);
                      display:flex;align-items:center;justify-content:center;
                      ${isHaltedState ? 'animation:pulse 2s infinite;' : ''}
                    "><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M8 6v6"/>
                      <path d="M15 6v6"/>
                      <path d="M2 12h19.6"/>
                      <path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/>
                      <circle cx="7" cy="18" r="2"/>
                      <path d="M9 18h5"/>
                      <circle cx="16" cy="18" r="2"/>
                    </svg></div>`,
                    iconSize: [32, 32],
                    iconAnchor: [16, 16],
                  })}>
                  <Popup>
                    <div style={{ fontFamily: 'IBM Plex Sans, sans-serif', minWidth: 140 }}>
                      <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Bus {busLabel}</p>
                      {isHaltedState ? (
                        <div style={{ fontSize: 12, color: '#525252' }}>
                          <p style={{ color: '#d97706', fontWeight: 600 }}>Halted at {route?.stops?.[0]?.name || 'start'}</p>
                          {isScheduled && <p>Departs: {scheduledDepartTime}</p>}
                          {haltedMode && <p>Will start tracking when bus approaches</p>}
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: '#525252', display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Speed</span><span style={{ fontWeight: 600 }}>{thisBus.speed} km/h</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Status</span><span style={{ fontWeight: 600, color: thisBus.status === 'on-time' ? '#16a34a' : '#f59e0b' }}>{thisBus.status}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Traffic</span><span style={{ fontWeight: 600 }}>{thisBus.traffic}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Capacity</span><span style={{ fontWeight: 600 }}>{thisBus.capacity || 'N/A'}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Progress</span><span style={{ fontWeight: 600 }}>{Math.round((thisBus.progress || 0) * 100)}%</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </Popup>
                </Marker>
                {homeLocation && fromStop && (
                  <>
                    <Polyline
                      positions={[[homeLocation.lat, homeLocation.lng], [fromStop.lat, fromStop.lng]]}
                      pathOptions={{ color: '#f59e0b', weight: 3, opacity: 0.7, dashArray: '8 6' }}
                    />
                    <Marker position={[homeLocation.lat, homeLocation.lng]}
                      icon={L.divIcon({
                        className: 'home-marker',
                        html: `<div style="
                          width:28px;height:28px;border-radius:50%;
                          background:#f59e0b;border:2px solid white;
                          box-shadow:0 2px 8px rgba(0,0,0,0.3);
                          display:flex;align-items:center;justify-content:center;
                        "><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                          <polyline points="9 22 9 12 15 12 15 22"/>
                        </svg></div>`,
                        iconSize: [28, 28],
                        iconAnchor: [14, 28],
                      })}>
                      <Popup><div className="text-xs font-semibold">Your Home</div></Popup>
                    </Marker>
                  </>
                )}
              </MapContainer>
            )
          })()}
        </div>
        {/* Speed Control Button */}
        <div className="absolute top-3 right-3 z-[1000]">
          <button onClick={async () => {
            const speeds = [1, 5, 10, 25, 50]
            const currentIdx = speeds.indexOf(simSpeed)
            const nextIdx = (currentIdx + 1) % speeds.length
            const nextSpeed = speeds[nextIdx]
            try {
              await axios.post(`${BACKEND_URL}/api/sim-speed`, { speed: nextSpeed })
              const res = await axios.get(`${BACKEND_URL}/api/sim-speed`)
              setSimSpeed(res.data.speed)
            } catch {
              try {
                const res = await axios.get(`${BACKEND_URL}/api/sim-speed`)
                setSimSpeed(res.data.speed)
              } catch {}
            }
          }}
            className="bg-white/90 backdrop-blur-sm border border-surface-200 rounded-xl px-3 py-2 shadow-lg flex items-center gap-1.5 hover:bg-white transition-all active:scale-95">
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-[11px] font-bold text-surface-700" style={{ fontFamily: 'Chivo, sans-serif' }}>
              {simSpeed}x
            </span>
          </button>
        </div>

        {isScheduled && (
          <div className="px-5 py-3">
            <div className="bg-amber-50 rounded-xl p-3 border border-amber-200">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-amber-600" />
                <p className="text-xs font-bold text-amber-700" style={{ fontFamily: 'Chivo, sans-serif' }}>
                  Bus Halted at {route?.stops?.[fromIdx ?? 0]?.name || 'Start'}
                </p>
              </div>
              <p className="text-[11px] text-amber-600">
                Departs at {scheduledDepartTime} &middot; Will start when previous bus completes
              </p>
            </div>
          </div>
        )}

        {/* Stop List */}
        <div className="px-5 py-4 pb-[320px]">
          <p className="text-[11px] font-bold text-surface-500 tracking-[0.15em] mb-3"
            style={{ fontFamily: 'Chivo, sans-serif' }}>ALL STOPS</p>
          <div className="space-y-1.5">
            {(() => {
              const nextStopIdx = route?.stops?.findIndex((_, idx) => {
                const eta = stopEtas[idx]
                return eta?.status !== 'passed'
              }) ?? -1

              return route?.stops?.map((stop, idx) => {
                const eta = stopEtas[idx]
                const isFrom = idx === fromIdx
                const isTo = idx === toIdx
                const isPassed = eta?.status === 'passed'
                const isNext = idx === nextStopIdx

                return (
                  <div key={stop.id}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl ${
                      isFrom ? 'bg-emerald-50 border border-emerald-200' :
                      isTo ? 'bg-blue-50 border border-blue-200' :
                      isPassed ? 'bg-surface-50' : 'bg-white border border-surface-100'
                    }`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                      isFrom ? 'bg-emerald-500' : isTo ? 'bg-blue-500' :
                      isPassed ? 'bg-surface-300' : isNext ? 'bg-emerald-500' : 'bg-surface-900'
                    }`}>
                      {isFrom || isTo ? (
                        <Check className="w-3 h-3 text-white" />
                      ) : (
                        <span className="text-[10px] font-bold text-white">{idx + 1}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-semibold truncate ${
                        isFrom ? 'text-emerald-800' : isTo ? 'text-blue-800' :
                        isPassed ? 'text-surface-400' : 'text-surface-900'
                      }`} style={{ fontFamily: 'Chivo, sans-serif' }}>
                        {stop.name}
                        {isFrom && <span className="ml-1 text-emerald-600">· Your stop</span>}
                        {isTo && <span className="ml-1 text-blue-600">· Destination</span>}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      {isPassed ? (
                        <span className="text-[11px] text-surface-400">Passed</span>
                      ) : eta?.etaMinutes !== null && eta?.etaMinutes !== undefined ? (
                        <span className={`text-[11px] font-bold ${
                          isFrom ? 'text-emerald-600' : isTo ? 'text-blue-600' : 'text-surface-600'
                        }`}>
                          {isFrom || isTo ? `${eta.etaMinutes} min` : eta.etaTime}
                        </span>
                      ) : (
                        <span className="text-[11px] text-surface-400">--</span>
                      )}
                    </div>
                  </div>
                )
              })
            })()}
          </div>
        </div>
      </div>

      {/* Bottom Card - Halted Mode */}
      {haltedMode && thisBus && (
        <div className="fixed bottom-[60px] left-0 right-0 z-40">
          <div className="max-w-md mx-auto bg-white border-t border-surface-200 shadow-[0_-4px_24px_rgba(0,0,0,0.1)] rounded-t-2xl">
            <div className="px-5 py-2 rounded-t-2xl bg-amber-500 text-white text-[11px] font-bold flex items-center gap-2" style={{ fontFamily: 'Chivo, sans-serif' }}>
              <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
              Bus {thisBus.number} — Halted at {route?.stops?.[0]?.name || 'start'}
            </div>
            <div className="px-5 py-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <p className="text-[11px] text-surface-500" style={{ fontFamily: 'Chivo, sans-serif' }}>BOARD</p>
                  </div>
                  <p className="text-sm font-bold text-surface-900" style={{ fontFamily: 'Chivo, sans-serif' }}>{fromStop?.name}</p>
                </div>
                <div className="flex flex-col items-center px-2">
                  <div className="w-8 h-[1px] bg-surface-300 relative">
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0 h-0 border-t-[3px] border-t-transparent border-b-[3px] border-b-transparent border-l-[5px] border-l-surface-400" />
                  </div>
                  <span className="text-[10px] text-amber-600 mt-1 font-bold">Approaching</span>
                </div>
                <div className="flex-1 text-right">
                  <div className="flex items-center gap-2 justify-end mb-1">
                    <p className="text-[11px] text-surface-500" style={{ fontFamily: 'Chivo, sans-serif' }}>DEST</p>
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                  </div>
                  <p className="text-sm font-bold text-surface-900" style={{ fontFamily: 'Chivo, sans-serif' }}>{toStop?.name}</p>
                </div>
              </div>
              <p className="text-[11px] text-surface-500 mb-3">Bus will start live tracking when it reaches {fromStop?.name || 'your stop'}</p>
              <div className="flex items-center gap-2">
                <button onClick={() => {
                  if (isPinned) return
                  localStorage.setItem('realtime-routes-pinned', JSON.stringify({ busId, routeId, fromStop: fromStop?.name, fromStopIndex: fromIdx, toStop: toStop?.name, toStopIndex: toIdx, halted: haltedMode, pinnedAt: Date.now() }))
                  setIsPinned(true)
                }} disabled={isPinned}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${isPinned ? 'bg-surface-200 text-surface-400 cursor-not-allowed' : 'bg-surface-900 text-white hover:bg-surface-800'}`}
                  style={{ fontFamily: 'Chivo, sans-serif' }}>
                  <MapPin className="w-3.5 h-3.5" />
                  {isPinned ? 'Pinned' : 'Pin Trip'}
                </button>
                <button onClick={handleBuyTicket}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-1.5 bg-[#1d4ed8] text-white hover:bg-[#1e3a8a]"
                  style={{ fontFamily: 'Chivo, sans-serif' }}>
                  <Ticket className="w-3.5 h-3.5" />
                  Buy Ticket
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Card - Approaching */}
      {!haltedMode && trackerState === 'approaching' && fromEta && toEta && (
        <div className="fixed bottom-[60px] left-0 right-0 z-40">
          <div className="max-w-md mx-auto bg-white border-t border-surface-200 shadow-[0_-4px_24px_rgba(0,0,0,0.1)] rounded-t-2xl">
            <div className={`px-5 py-2 rounded-t-2xl text-[11px] font-bold ${
              fromEta.etaMinutes <= 5 ? 'bg-emerald-500 text-white' : 'bg-surface-900 text-white'
            }`} style={{ fontFamily: 'Chivo, sans-serif' }}>
              {fromEta.etaMinutes <= 5
                ? 'Bus approaching — go now!'
                : `Bus in ${fromEta.etaMinutes} min — you have time`}
            </div>
            <div className="px-5 py-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <p className="text-[11px] text-surface-500" style={{ fontFamily: 'Chivo, sans-serif' }}>BOARD</p>
                  </div>
                  <p className="text-sm font-bold text-surface-900" style={{ fontFamily: 'Chivo, sans-serif' }}>{fromStop?.name}</p>
                </div>
                <div className="flex flex-col items-center px-2">
                  <div className="w-8 h-[1px] bg-surface-300 relative">
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0 h-0 border-t-[3px] border-t-transparent border-b-[3px] border-b-transparent border-l-[5px] border-l-surface-400" />
                  </div>
                  <span className="text-[10px] text-surface-400 mt-1">{fromEta.etaMinutes} min</span>
                </div>
                <div className="flex-1 text-right">
                  <div className="flex items-center gap-2 justify-end mb-1">
                    <p className="text-[11px] text-surface-500" style={{ fontFamily: 'Chivo, sans-serif' }}>DEST</p>
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                  </div>
                  <p className="text-sm font-bold text-surface-900" style={{ fontFamily: 'Chivo, sans-serif' }}>{toStop?.name}</p>
                </div>
              </div>
              <div className="flex items-center justify-between bg-surface-50 rounded-xl px-4 py-2.5 mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-surface-500">Leave home by</span>
                  <span className="text-sm font-bold text-surface-900" style={{ fontFamily: 'Chivo, sans-serif' }}>{leaveBy || '--'}</span>
                </div>
                <button onClick={() => setShowWalkModal(true)} className="text-[11px] text-surface-400 hover:text-surface-600 underline">Change</button>
              </div>
              {thisBus && (
                <div className="flex items-center gap-3 text-[11px] mb-3">
                  <span className="flex items-center gap-1 text-surface-500"><Gauge className="w-3 h-3" /> {thisBus.speed} km/h</span>
                  <span className={`flex items-center gap-1 ${(TRAFFIC_LABELS[thisBus.traffic] || TRAFFIC_LABELS.moderate).color}`}>
                    <Cloud className="w-3 h-3" /> {(TRAFFIC_LABELS[thisBus.traffic] || TRAFFIC_LABELS.moderate).label}
                  </span>
                  <span className="text-surface-400 ml-auto">{thisBus.status}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <button onClick={() => {
                  if (isPinned) return
                  localStorage.setItem('realtime-routes-pinned', JSON.stringify({ busId, routeId, fromStop: fromStop?.name, fromStopIndex: fromIdx, toStop: toStop?.name, toStopIndex: toIdx, halted: haltedMode, pinnedAt: Date.now() }))
                  setIsPinned(true)
                }} disabled={isPinned}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${isPinned ? 'bg-surface-200 text-surface-400 cursor-not-allowed' : 'bg-surface-900 text-white hover:bg-surface-800'}`}
                  style={{ fontFamily: 'Chivo, sans-serif' }}>
                  <MapPin className="w-3.5 h-3.5" />
                  {isPinned ? 'Pinned' : 'Pin Trip'}
                </button>
                <button onClick={handleBuyTicket}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-1.5 bg-[#1d4ed8] text-white hover:bg-[#1e3a8a]"
                  style={{ fontFamily: 'Chivo, sans-serif' }}>
                  <Ticket className="w-3.5 h-3.5" />
                  Buy Ticket
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Card - Scheduled Bus */}
      {isScheduled && (
        <div className="fixed bottom-[60px] left-0 right-0 z-40">
          <div className="max-w-md mx-auto bg-white border-t border-surface-200 shadow-[0_-4px_24px_rgba(0,0,0,0.1)] rounded-t-2xl">
            <div className="px-5 py-2 rounded-t-2xl bg-amber-500 text-white text-[11px] font-bold" style={{ fontFamily: 'Chivo, sans-serif' }}>
              Bus {scheduledBusNumber} — Departs at {scheduledDepartTime}
            </div>
            <div className="px-5 py-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <p className="text-[11px] text-surface-500" style={{ fontFamily: 'Chivo, sans-serif' }}>BOARD</p>
                  </div>
                  <p className="text-sm font-bold text-surface-900" style={{ fontFamily: 'Chivo, sans-serif' }}>{fromStop?.name}</p>
                </div>
                <div className="flex flex-col items-center px-2">
                  <div className="w-8 h-[1px] bg-surface-300 relative">
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0 h-0 border-t-[3px] border-t-transparent border-b-[3px] border-b-transparent border-l-[5px] border-l-surface-400" />
                  </div>
                  <span className="text-[10px] text-amber-600 mt-1 font-bold">Halted</span>
                </div>
                <div className="flex-1 text-right">
                  <div className="flex items-center gap-2 justify-end mb-1">
                    <p className="text-[11px] text-surface-500" style={{ fontFamily: 'Chivo, sans-serif' }}>DEST</p>
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                  </div>
                  <p className="text-sm font-bold text-surface-900" style={{ fontFamily: 'Chivo, sans-serif' }}>{toStop?.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => {
                  if (isPinned) return
                  localStorage.setItem('realtime-routes-pinned', JSON.stringify({ busId, routeId, fromStop: fromStop?.name, fromStopIndex: fromIdx, toStop: toStop?.name, toStopIndex: toIdx, halted: haltedMode, pinnedAt: Date.now() }))
                  setIsPinned(true)
                }} disabled={isPinned}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${isPinned ? 'bg-surface-200 text-surface-400 cursor-not-allowed' : 'bg-surface-900 text-white hover:bg-surface-800'}`}
                  style={{ fontFamily: 'Chivo, sans-serif' }}>
                  <MapPin className="w-3.5 h-3.5" />
                  {isPinned ? 'Pinned' : 'Pin Trip'}
                </button>
                <button onClick={handleBuyTicket}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-1.5 bg-[#1d4ed8] text-white hover:bg-[#1e3a8a]"
                  style={{ fontFamily: 'Chivo, sans-serif' }}>
                  <Ticket className="w-3.5 h-3.5" />
                  Buy Ticket
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Card - Riding */}
      {trackerState === 'riding' && tripProgress && (
        <div className="fixed bottom-[60px] left-0 right-0 z-40">
          <div className="max-w-md mx-auto bg-white border-t border-surface-200 shadow-[0_-4px_24px_rgba(0,0,0,0.1)] rounded-t-2xl">
            <div className="px-5 py-2 rounded-t-2xl bg-emerald-500 text-white text-[11px] font-bold" style={{ fontFamily: 'Chivo, sans-serif' }}>
              You're on the bus — heading to {toStop?.name}
            </div>
            <div className="px-5 py-4">
              <div className="flex items-baseline gap-1 mb-3">
                <span className="text-4xl font-black text-surface-900" style={{ fontFamily: 'Chivo, sans-serif', lineHeight: '1' }}>
                  {tripProgress.etaMinutes}
                </span>
                <span className="text-base font-bold text-surface-500" style={{ fontFamily: 'Chivo, sans-serif' }}>min to destination</span>
              </div>
              <div className="w-full bg-surface-100 rounded-full h-3 overflow-hidden mb-2">
                <div className="h-full bg-emerald-500 rounded-full transition-all duration-1000" style={{ width: `${tripProgress.progressPct}%` }} />
              </div>
              <div className="flex items-center justify-between text-[11px] text-surface-500 mb-3">
                <span>{fromStop?.name}</span>
                <span>{tripProgress.progressPct}%</span>
                <span>{toStop?.name}</span>
              </div>
              <div className="flex items-center gap-3 text-[11px] bg-surface-50 rounded-xl px-4 py-2.5 mb-3">
                <span className="text-surface-500">{tripProgress.distToDest} km left</span>
                {thisBus && (
                  <>
                    <span className="flex items-center gap-1 text-surface-500"><Gauge className="w-3 h-3" /> {thisBus.speed} km/h</span>
                    <span className={`flex items-center gap-1 ${(TRAFFIC_LABELS[thisBus.traffic] || TRAFFIC_LABELS.moderate).color}`}>
                      <Cloud className="w-3 h-3" /> {(TRAFFIC_LABELS[thisBus.traffic] || TRAFFIC_LABELS.moderate).label}
                    </span>
                  </>
                )}
              </div>
              <div className="bg-blue-50 rounded-xl px-4 py-3 text-center mb-3">
                <p className="text-xs text-blue-800 font-semibold" style={{ fontFamily: 'Chivo, sans-serif' }}>
                  Getting off at: {toStop?.name}
                </p>
                <p className="text-[11px] text-blue-600 mt-0.5">We'll remind you before your stop</p>
              </div>
              <button onClick={handleBuyTicket}
                className="w-full py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-1.5 bg-[#1d4ed8] text-white hover:bg-[#1e3a8a]"
                style={{ fontFamily: 'Chivo, sans-serif' }}>
                <Ticket className="w-3.5 h-3.5" />
                Buy Ticket
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Card - Missed */}
      {trackerState === 'missed' && (
        <div className="fixed bottom-[60px] left-0 right-0 z-40">
          <div className="max-w-md mx-auto bg-white border-t border-surface-200 shadow-[0_-4px_24px_rgba(0,0,0,0.1)] rounded-t-2xl">
            <div className="px-5 py-2 rounded-t-2xl bg-amber-500 text-white text-[11px] font-bold" style={{ fontFamily: 'Chivo, sans-serif' }}>
              You missed this bus — here are your options
            </div>
            <div className="px-5 py-4">
              <p className="text-[11px] font-bold text-surface-500 tracking-[0.15em] mb-3" style={{ fontFamily: 'Chivo, sans-serif' }}>NEXT OPTIONS</p>
              <div className="space-y-2 mb-4">
                {buses.filter(b => b.id !== busId && b.state !== 'completed').slice(0, 3).map(bus => {
                  const dist = haversineDistance(bus.lat, bus.lng, fromStop?.lat || 0, fromStop?.lng || 0)
                  const eta = Math.round(Math.max(1, (dist / (bus.speed || 25)) * 60 * getTimeOfDayFactor()))
                  return (
                    <button key={bus.id} onClick={() => navigate(`/app/track/${routeId}/${bus.id}?from=${fromIdx}&to=${toIdx}`)}
                      className="w-full flex items-center justify-between p-3 rounded-xl bg-surface-50 border border-surface-200 hover:border-surface-300 transition-all">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black"
                          style={{ backgroundColor: color.bg, color: color.text, fontFamily: 'Chivo, sans-serif' }}>
                          {bus.number}
                        </div>
                        <div className="text-left">
                          <p className="text-xs font-bold text-surface-900" style={{ fontFamily: 'Chivo, sans-serif' }}>Bus {bus.number}</p>
                          <p className="text-[10px] text-surface-400">{bus.speed} km/h · {bus.traffic}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-emerald-600" style={{ fontFamily: 'Chivo, sans-serif' }}>{eta} min</p>
                        <p className="text-[10px] text-surface-400">at your stop</p>
                      </div>
                    </button>
                  )
                })}
              </div>
              <button onClick={() => setTrackerState('approaching')}
                className="w-full py-2.5 rounded-xl text-sm font-bold bg-surface-100 text-surface-700 hover:bg-surface-200 transition-all"
                style={{ fontFamily: 'Chivo, sans-serif' }}>
                Back to tracking
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Card - Trip Complete (user reached destination) */}
      {trackerState === 'trip-complete' && (
        <div className="fixed bottom-[60px] left-0 right-0 z-40">
          <div className="max-w-md mx-auto bg-white border-t border-surface-200 shadow-[0_-4px_24px_rgba(0,0,0,0.1)] rounded-t-2xl">
            <div className="px-5 py-2 rounded-t-2xl bg-emerald-500 text-white text-[11px] font-bold" style={{ fontFamily: 'Chivo, sans-serif' }}>
              Trip complete!
            </div>
            <div className="px-5 py-4 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                <Check className="w-6 h-6 text-emerald-600" />
              </div>
              <p className="text-sm font-bold text-surface-900 mb-1" style={{ fontFamily: 'Chivo, sans-serif' }}>
                You've reached {toStop?.name}
              </p>
              <p className="text-xs text-surface-500 mb-4">
                {fromStop?.name} → {toStop?.name} · Trip completed successfully
              </p>
              <button onClick={() => { setTrackerState('approaching'); navigate('/app') }}
                className="w-full py-2.5 rounded-xl text-sm font-bold bg-surface-900 text-white hover:bg-surface-800 transition-all"
                style={{ fontFamily: 'Chivo, sans-serif' }}>
                Back to home
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Card - Completed */}
      {trackerState === 'completed' && (
        <div className="fixed bottom-[60px] left-0 right-0 z-40">
          <div className="max-w-md mx-auto bg-white border-t border-surface-200 shadow-[0_-4px_24px_rgba(0,0,0,0.1)] rounded-t-2xl">
            <div className="px-5 py-2 rounded-t-2xl bg-surface-900 text-white text-[11px] font-bold" style={{ fontFamily: 'Chivo, sans-serif' }}>
              Bus completed its route
            </div>
            <div className="px-5 py-4 text-center">
              <p className="text-sm font-bold text-surface-900 mb-1" style={{ fontFamily: 'Chivo, sans-serif' }}>
                {thisBus?.number} finished the trip
              </p>
              <p className="text-xs text-surface-500 mb-4">The bus will start a new trip shortly</p>
              <button onClick={() => setTrackerState('approaching')}
                className="w-full py-2.5 rounded-xl text-sm font-bold bg-surface-900 text-white hover:bg-surface-800 transition-all"
                style={{ fontFamily: 'Chivo, sans-serif' }}>
                Keep tracking
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ticket Summary Modal */}
      {paymentStep === 'summary' && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="fixed inset-0 bg-black/40" onClick={() => setPaymentStep(null)} />
          <div className="relative bg-white rounded-t-2xl w-full max-w-md shadow-xl z-10 mb-[60px]">
            <div className="px-6 pt-6 pb-2">
              <div className="flex items-center gap-2 mb-4">
                <Ticket className="w-5 h-5 text-[#1d4ed8]" />
                <p className="text-sm font-bold text-surface-900" style={{ fontFamily: 'Chivo, sans-serif' }}>
                  Ticket Summary
                </p>
              </div>

              <div className="space-y-3 mb-4">
                <div className="flex items-center justify-between py-2 border-b border-dashed border-surface-200">
                  <span className="text-[13px] text-surface-500">Route</span>
                  <span className="text-[13px] font-bold text-surface-900">{route?.number || routeId}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-dashed border-surface-200">
                  <span className="text-[13px] text-surface-500">From</span>
                  <span className="text-[13px] font-bold text-surface-900">{fromStop?.name}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-dashed border-surface-200">
                  <span className="text-[13px] text-surface-500">To</span>
                  <span className="text-[13px] font-bold text-surface-900">{toStop?.name}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-dashed border-surface-200">
                  <span className="text-[13px] text-surface-500">Bus</span>
                  <span className="text-[13px] font-bold text-surface-900">{thisBus?.number || busId}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-dashed border-surface-200">
                  <span className="text-[13px] text-surface-500">Date</span>
                  <span className="text-[13px] font-bold text-surface-900">Today, {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-dashed border-surface-200">
                  <span className="text-[13px] text-surface-500">Time</span>
                  <span className="text-[13px] font-bold text-surface-900">{busArrivesAt || '--'}</span>
                </div>
              </div>

              <div className="bg-surface-50 rounded-xl p-4 mb-4">
                <div className="flex items-center justify-between py-1">
                  <span className="text-[13px] text-surface-500">Fare</span>
                  <span className="text-[13px] font-bold text-surface-900">₹{FARE}</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-[13px] text-surface-500">Convenience fee</span>
                  <span className="text-[13px] font-bold text-surface-900">₹{CONVENIENCE_FEE}</span>
                </div>
                <div className="flex items-center justify-between py-2 mt-1 border-t border-surface-200">
                  <span className="text-sm font-bold text-surface-900" style={{ fontFamily: 'Chivo, sans-serif' }}>Total</span>
                  <span className="text-lg font-black text-[#1d4ed8]" style={{ fontFamily: 'Chivo, sans-serif' }}>₹{TOTAL_FARE}</span>
                </div>
              </div>
            </div>

            <div className="px-6 pb-6">
              <button onClick={handleProceedToPay}
                className="w-full py-3 rounded-xl text-sm font-bold bg-[#1d4ed8] text-white hover:bg-[#1e3a8a] transition-all"
                style={{ fontFamily: 'Chivo, sans-serif' }}>
                Proceed to Pay ₹{TOTAL_FARE}
              </button>
              <p className="text-[10px] text-surface-400 text-center mt-2">Secured by HONK LIVE</p>
            </div>
          </div>
        </div>
      )}

      {/* Mock Payment Screen */}
      {paymentStep === 'payment' && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-200">
            <button onClick={() => setPaymentStep('summary')}
              className="p-1 hover:bg-surface-100 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5 text-surface-700" />
            </button>
            <p className="text-sm font-bold text-surface-900" style={{ fontFamily: 'Chivo, sans-serif' }}>Payment</p>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center px-6">
            <div className="text-center mb-8">
              <p className="text-xl font-black text-surface-900" style={{ fontFamily: 'Chivo, sans-serif' }}>HONK LIVE</p>
              <p className="text-3xl font-black text-[#1d4ed8] mt-2" style={{ fontFamily: 'Chivo, sans-serif' }}>₹{TOTAL_FARE}.00</p>
            </div>

            <div className="w-full max-w-xs space-y-6">
              <div>
                <p className="text-xs font-bold text-surface-500 mb-2" style={{ fontFamily: 'Chivo, sans-serif' }}>Pay using UPI</p>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Enter UPI ID"
                    value={upiId}
                    onChange={(e) => { setUpiId(e.target.value); setSelectedApp(null) }}
                    className="w-full px-4 py-3 border border-surface-300 rounded-xl text-sm text-surface-900 focus:outline-none focus:border-[#1d4ed8]"
                    style={{ fontFamily: 'Chivo, sans-serif' }}
                  />
                </div>
                <p className="text-[10px] text-surface-400 mt-1">example@upi</p>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-surface-200" />
                <span className="text-[11px] text-surface-400 font-bold" style={{ fontFamily: 'Chivo, sans-serif' }}>OR</span>
                <div className="flex-1 h-px bg-surface-200" />
              </div>

              <div className="flex items-center justify-center gap-4">
                {[
                  { id: 'gpay', label: 'G Pay', bg: '#1a1a2e', text: '#ffffff' },
                  { id: 'phonepe', label: 'PhonePe', bg: '#5f259f', text: '#ffffff' },
                  { id: 'paytm', label: 'Paytm', bg: '#00baf2', text: '#ffffff' },
                ].map(app => (
                  <button key={app.id}
                    onClick={() => { setSelectedApp(app.id); setUpiId('') }}
                    className={`px-5 py-2.5 rounded-xl text-xs font-bold border-2 transition-all ${
                      selectedApp === app.id
                        ? 'border-[#1d4ed8] shadow-md'
                        : 'border-surface-200 hover:border-surface-300'
                    }`}
                    style={{ backgroundColor: app.bg, color: app.text, fontFamily: 'Chivo, sans-serif' }}>
                    {app.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="px-6 pb-8 pt-4">
            <button
              onClick={handlePayNow}
              disabled={!upiId.trim() && !selectedApp}
              className={`w-full py-3.5 rounded-xl text-sm font-bold transition-all ${
                upiId.trim() || selectedApp
                  ? 'bg-[#1d4ed8] text-white hover:bg-[#1e3a8a]'
                  : 'bg-surface-200 text-surface-400 cursor-not-allowed'
              }`}
              style={{ fontFamily: 'Chivo, sans-serif' }}>
              Pay Now
            </button>
            <div className="flex items-center justify-center gap-1.5 mt-3">
              <svg className="w-3 h-3 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <p className="text-[10px] text-surface-400">Secured by HONK LIVE</p>
            </div>
          </div>
        </div>
      )}

      {/* Processing Screen */}
      {paymentStep === 'processing' && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center">
          <div className="w-12 h-12 border-3 border-surface-200 border-t-[#1d4ed8] rounded-full animate-spin mb-4" />
          <p className="text-sm font-bold text-surface-900" style={{ fontFamily: 'Chivo, sans-serif' }}>Processing payment...</p>
          <p className="text-xs text-surface-500 mt-1">₹{TOTAL_FARE} · UPI</p>
        </div>
      )}

      {/* Ticket Confirmed Modal */}
      {paymentStep === 'ticket' && confirmedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative bg-white rounded-2xl w-full max-w-sm mx-4 shadow-2xl overflow-hidden">
            <div className="bg-emerald-500 px-6 py-4 text-center">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-2">
                <Check className="w-5 h-5 text-white" />
              </div>
              <p className="text-sm font-bold text-white" style={{ fontFamily: 'Chivo, sans-serif' }}>
                Ticket Confirmed!
              </p>
            </div>

            <div className="px-6 py-5">
              <div className="text-center mb-4">
                <p className="text-xs font-bold text-surface-400 tracking-[0.15em]" style={{ fontFamily: 'Chivo, sans-serif' }}>
                  HONK LIVE
                </p>
                <p className="text-[10px] text-surface-400">Boarding Pass</p>
              </div>

              <div className="text-center mb-4">
                <p className="text-2xl font-black text-surface-900" style={{ fontFamily: 'Chivo, sans-serif' }}>
                  {confirmedTicket.routeNumber}
                </p>
                <p className="text-xs text-surface-500">{confirmedTicket.routeName}</p>
              </div>

              <div className="flex items-center justify-between mb-4 px-2">
                <div className="text-center">
                  <p className="text-[10px] text-surface-400 mb-0.5">FROM</p>
                  <p className="text-xs font-bold text-surface-900">{confirmedTicket.fromStop}</p>
                </div>
                <div className="flex-1 mx-3 relative">
                  <div className="border-t border-dashed border-surface-300" />
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-surface-100 flex items-center justify-center">
                    <Bus className="w-3 h-3 text-surface-400" />
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-surface-400 mb-0.5">TO</p>
                  <p className="text-xs font-bold text-surface-900">{confirmedTicket.toStop}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-surface-50 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-surface-400 mb-0.5">DATE</p>
                  <p className="text-[11px] font-bold text-surface-900">{confirmedTicket.date}</p>
                </div>
                <div className="bg-surface-50 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-surface-400 mb-0.5">TIME</p>
                  <p className="text-[11px] font-bold text-surface-900">{confirmedTicket.time}</p>
                </div>
                <div className="bg-surface-50 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-surface-400 mb-0.5">BUS</p>
                  <p className="text-[11px] font-bold text-surface-900">{confirmedTicket.busNumber}</p>
                </div>
                <div className="bg-surface-50 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-surface-400 mb-0.5">SEAT</p>
                  <p className="text-[11px] font-bold text-surface-900">Any</p>
                </div>
              </div>

              <div className="flex justify-center mb-3">
                <div className="w-28 h-28 bg-white border-2 border-surface-200 rounded-xl flex items-center justify-center">
                  <div className="grid grid-cols-5 gap-0.5">
                    {Array.from({ length: 25 }).map((_, i) => (
                      <div key={i} className={`w-3.5 h-3.5 rounded-sm ${Math.random() > 0.5 ? 'bg-surface-900' : 'bg-white'}`} />
                    ))}
                  </div>
                </div>
              </div>

              <div className="text-center mb-3">
                <p className="text-[9px] text-surface-400 font-mono">TXN: {confirmedTicket.paymentId}</p>
                <p className="text-[9px] text-surface-400 font-mono">TKT: {confirmedTicket.id}</p>
                <p className="text-[11px] font-bold text-surface-500 mt-1" style={{ fontFamily: 'Chivo, sans-serif' }}>
                  ₹{confirmedTicket.total}
                </p>
              </div>

              <button onClick={() => {
                const history = JSON.parse(localStorage.getItem('realtime-routes-trip-history') || '[]')
                history.unshift({
                  routeId, routeNumber: confirmedTicket.routeNumber,
                  fromStop: confirmedTicket.fromStop, fromStopIndex: fromIdx,
                  toStop: confirmedTicket.toStop, toStopIndex: toIdx,
                  busId, busNumber: confirmedTicket.busNumber,
                  ticketId: confirmedTicket.id, paymentId: confirmedTicket.paymentId,
                  fare: confirmedTicket.total,
                  startedAt: Date.now(),
                })
                if (history.length > 20) history.length = 20
                localStorage.setItem('realtime-routes-trip-history', JSON.stringify(history))

                setPaymentStep(null)
                setConfirmedTicket(null)
                navigate('/app')
              }}
                className="w-full py-2.5 rounded-xl text-sm font-bold bg-[#1d4ed8] text-white hover:bg-[#1e3a8a] transition-all"
                style={{ fontFamily: 'Chivo, sans-serif' }}>
                Go to Home
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
