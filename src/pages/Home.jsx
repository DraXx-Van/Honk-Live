import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { Bell, Clock, X, Search, MapPin, Bus, Gauge, CheckCircle, AlertTriangle, XCircle, Check, Home as HomeIcon, ChevronRight } from 'lucide-react'
import HomeLocationPicker from '../components/HomeLocationPicker'
import { calculateLeaveTime, formatClockTime } from '../utils/leaveTime'

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

function getWalkMinutes() {
  try {
    const raw = localStorage.getItem('realtime-routes-walk')
    return raw ? JSON.parse(raw).walkMinutes : null
  } catch { return null }
}

function setWalkMinutes(mins) {
  localStorage.setItem('realtime-routes-walk', JSON.stringify({ walkMinutes: mins, manual: true }))
}

function getPinnedStop() {
  try {
    const raw = localStorage.getItem('realtime-routes-pinned')
    if (!raw) return null
    const data = JSON.parse(raw)
    if (data.routeNumber === undefined && data.routeId) {
      return data
    }
    return {
      busId: null,
      routeId: data.routeId,
      fromStop: data.stopName || data.fromStop,
      fromStopIndex: data.fromStopIndex ?? 0,
      toStop: data.toStop || null,
      toStopIndex: data.toStopIndex ?? null,
      halted: data.halted || false,
      pinnedAt: data.pinnedAt || Date.now(),
    }
  } catch { return null }
}

function clearPinnedStop() {
  localStorage.removeItem('realtime-routes-pinned')
}

function getTimeOfDayFactor() {
  const hour = new Date().getHours()
  if (hour >= 8 && hour < 10) return 1.4
  if (hour >= 17 && hour < 20) return 1.45
  if (hour >= 10 && hour < 17) return 1.15
  return 1.0
}

const WALK_OPTIONS = [
  { label: 'Under 5 min walk', value: 3 },
  { label: '5–10 min walk', value: 7 },
  { label: '10–15 min walk', value: 12 },
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

function OnboardingCard({ onDismiss }) {
  const navigate = useNavigate()
  return (
    <div className="relative bg-[#eff6ff] border border-[#bfdbfe] rounded-2xl p-4 mb-6">
      <button onClick={onDismiss}
        className="absolute top-3 right-3 p-1 rounded-full hover:bg-blue-100/50 transition-colors">
        <X className="w-3.5 h-3.5 text-[#3b82f6]" />
      </button>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
          <MapPin className="w-5 h-5 text-[#1e40af]" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-[#1e40af] mb-1" style={{ fontFamily: 'Chivo, sans-serif' }}>
            Track your daily commute
          </p>
          <p className="text-[13px] text-[#3b82f6] mb-3 leading-relaxed">
            Pick a route → select your stop → pin it here for live leave-time updates
          </p>
          <button onClick={() => navigate('/app/routes')}
            className="text-[13px] font-bold text-[#1e40af] hover:text-[#1d4ed8] transition-colors flex items-center gap-1 ml-auto"
            style={{ fontFamily: 'Chivo, sans-serif' }}>
            Browse Routes →
          </button>
        </div>
      </div>
    </div>
  )
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

export default function Home() {
  const navigate = useNavigate()
  const [currentTime, setCurrentTime] = useState(new Date())
  const [pinnedStop, setPinnedStop] = useState(getPinnedStop())
  const [walkMinutes, setWalkMinutesState] = useState(getWalkMinutes)
  const [showWalkModal, setShowWalkModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const searchRef = useRef(null)
  const [showCatchModal, setShowCatchModal] = useState(false)
  const [homeLocation, setHomeLocation] = useState(() => {
    try {
      const raw = localStorage.getItem('honk-home-location')
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  })
  const [showHomePicker, setShowHomePicker] = useState(false)
  const [ridingState, setRidingState] = useState(() => {
    try {
      const raw = localStorage.getItem('realtime-routes-riding')
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  })
  const [onboardingDismissed, setOnboardingDismissed] = useState(() => {
    try {
      return localStorage.getItem('onboardingDismissed') === 'true'
    } catch { return false }
  })
  const [showStatusInfo, setShowStatusInfo] = useState(false)
  const [tripCompleted, setTripCompleted] = useState(null)
  const [notificationGranted, setNotificationGranted] = useState(() => {
    return 'Notification' in window && Notification.permission === 'granted'
  })
  const notifiedLeaveRef = useRef(false)

  useEffect(() => {
    if (pinnedStop && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(p => setNotificationGranted(p === 'granted'))
    }
  }, [pinnedStop])

  const hasTicket = useMemo(() => {
    try {
      const tickets = JSON.parse(localStorage.getItem('realtime-routes-tickets') || '[]')
      return tickets.some(t =>
        t.routeId === pinnedStop?.routeId &&
        t.busId === pinnedStop?.busId &&
        t.fromStop === pinnedStop?.fromStop &&
        t.toStop === pinnedStop?.toStop
      )
    } catch { return false }
  }, [pinnedStop])

  const hasRidingTicket = useMemo(() => {
    try {
      const tickets = JSON.parse(localStorage.getItem('realtime-routes-tickets') || '[]')
      return tickets.some(t =>
        t.routeId === ridingState?.routeId &&
        t.busId === ridingState?.busId &&
        t.fromStop === ridingState?.fromStop &&
        t.toStop === ridingState?.toStop
      )
    } catch { return false }
  }, [ridingState])

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
      try {
        const raw = localStorage.getItem('realtime-routes-riding')
        setRidingState(raw ? JSON.parse(raw) : null)
      } catch { setRidingState(null) }
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const syncPinned = setInterval(() => {
      const fresh = getPinnedStop()
      setPinnedStop(prev => {
        if (!prev && !fresh) return null
        if (!prev || !fresh) return fresh
        if (prev.halted !== fresh.halted || prev.busId !== fresh.busId) return fresh
        return prev
      })
    }, 3000)
    return () => clearInterval(syncPinned)
  }, [])

  useEffect(() => {
    function handleClick(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setSearchFocused(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const dismissOnboarding = useCallback(() => {
    localStorage.setItem('onboardingDismissed', 'true')
    setOnboardingDismissed(true)
  }, [])

  const { data: routes, isLoading, error } = useQuery({
    queryKey: ['routes'],
    queryFn: () => axios.get(`${BACKEND_URL}/api/routes`).then(r => r.data),
    refetchInterval: 30000,
  })

  const { data: routeDetails } = useQuery({
    queryKey: ['all-route-details', routes?.map(r => r.id)],
    queryFn: async () => {
      if (!routes) return {}
      const results = await Promise.all(
        routes.map(route =>
          axios.get(`${BACKEND_URL}/api/routes/${route.id}`).then(r => ({ id: route.id, data: r.data }))
        )
      )
      return Object.fromEntries(results.map(r => [r.id, r.data]))
    },
    enabled: !!routes && routes.length > 0,
    staleTime: 120000,
  })

  const { data: allBuses } = useQuery({
    queryKey: ['all-buses', routes?.map(r => r.id)],
    queryFn: async () => {
      if (!routes) return {}
      const results = await Promise.all(
        routes.map(route =>
          axios.get(`${BACKEND_URL}/api/buses/${route.id}`).then(r => ({ id: route.id, buses: r.data.buses || [] }))
        )
      )
      return Object.fromEntries(results.map(r => [r.id, r.buses]))
    },
    enabled: !!routes && routes.length > 0,
    refetchInterval: 2000,
  })

  const { data: pinnedRoute } = useQuery({
    queryKey: ['pinned-route', pinnedStop?.routeId],
    queryFn: () => {
      if (!pinnedStop) return null
      return axios.get(`${BACKEND_URL}/api/routes/${pinnedStop.routeId}`).then(r => r.data)
    },
    enabled: !!pinnedStop,
  })

  const { data: pinnedStopEtas } = useQuery({
    queryKey: ['pinned-stop-etas', pinnedStop?.routeId],
    queryFn: () => {
      if (!pinnedStop) return null
      return axios.get(`${BACKEND_URL}/api/stop-etas/${pinnedStop.routeId}`).then(r => r.data)
    },
    enabled: !!pinnedStop,
    refetchInterval: 5000,
  })

  useEffect(() => {
    if (pinnedStop && walkMinutes === null) {
      if (homeLocation && pinnedRoute?.stops) {
        const fromStop = pinnedRoute.stops[pinnedStop.fromStopIndex ?? 0]
        if (fromStop) {
          const dist = haversineDistance(homeLocation.lat, homeLocation.lng, fromStop.lat, fromStop.lng)
          const walkMin = Math.max(1, Math.round((dist / 5) * 60))
          setWalkMinutesState(walkMin)
          setWalkMinutes(walkMin)
          return
        }
      }
      setShowWalkModal(true)
    }
  }, [pinnedStop, homeLocation, pinnedRoute])

  const pinnedStopName = useMemo(() => {
    if (!pinnedStop) return null
    if (pinnedStop.fromStop) return pinnedStop.fromStop
    if (pinnedRoute?.stops?.[pinnedStop.fromStopIndex]) return pinnedRoute.stops[pinnedStop.fromStopIndex].name
    return null
  }, [pinnedStop, pinnedRoute])

  const pinnedDestinationName = useMemo(() => {
    if (!pinnedStop) return null
    if (pinnedStop.toStop) return pinnedStop.toStop
    if (pinnedRoute?.stops?.[pinnedStop.toStopIndex]) return pinnedRoute.stops[pinnedStop.toStopIndex].name
    return null
  }, [pinnedStop, pinnedRoute])

  const pinnedRouteNumber = useMemo(() => {
    if (!pinnedStop || !pinnedRoute) return ''
    const busId = pinnedStop.busId
    if (busId) {
      const numMatch = busId.match(/^(\d+\w*)/)
      return numMatch ? numMatch[1] : pinnedRoute.number
    }
    return pinnedRoute.number
  }, [pinnedStop, pinnedRoute])

  const { data: ridingBus } = useQuery({
    queryKey: ['riding-bus', ridingState?.busId, ridingState?.routeId],
    queryFn: () => {
      if (!ridingState) return null
      return axios.get(`${BACKEND_URL}/api/buses/${ridingState.routeId}`).then(r => {
        const bus = r.data.buses?.find(b => b.id === ridingState.busId)
        return bus || null
      })
    },
    enabled: !!ridingState,
    refetchInterval: 2000,
  })

  const { data: ridingRoute } = useQuery({
    queryKey: ['riding-route', ridingState?.routeId],
    queryFn: () => {
      if (!ridingState) return null
      return axios.get(`${BACKEND_URL}/api/routes/${ridingState.routeId}`).then(r => r.data)
    },
    enabled: !!ridingState,
  })

  const ridingEta = useMemo(() => {
    if (!ridingBus || !ridingRoute || !ridingState) return null
    const toStop = ridingRoute.stops?.[ridingState.toStopIndex]
    if (!toStop) return null
    const R = 6371
    const dLat = (toStop.lat - ridingBus.lat) * Math.PI / 180
    const dLng = (toStop.lng - ridingBus.lng) * Math.PI / 180
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(ridingBus.lat * Math.PI / 180) * Math.cos(toStop.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
    const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    const speed = ridingBus.speed || 25
    return { dist: dist.toFixed(1), etaMin: Math.round(Math.max(1, (dist / speed) * 60)) }
  }, [ridingBus, ridingRoute, ridingState])

  const prevRidingProgressRef = useRef(null)
  const ridingProgressInitRef = useRef(false)

  useEffect(() => {
    if (!ridingBus || !ridingState) {
      prevRidingProgressRef.current = null
      ridingProgressInitRef.current = false
      return
    }
    if (ridingBus.state === 'completed') {
      completeTrip()
      return
    }
    const currentProg = ridingBus.progress || 0
    if (!ridingProgressInitRef.current) {
      prevRidingProgressRef.current = currentProg
      ridingProgressInitRef.current = true
      return
    }
    const prevProg = prevRidingProgressRef.current
    if (prevProg !== null && currentProg !== prevProg) {
      if (prevProg > 0.85 && currentProg < 0.15) {
        completeTrip()
        return
      }
    }
    prevRidingProgressRef.current = currentProg
  }, [ridingBus, ridingState])

  useEffect(() => {
    if (ridingState && ridingBus === undefined) return
    if (ridingState && ridingBus === null) {
      completeTrip()
      return
    }
    if (ridingEta && parseFloat(ridingEta.dist) < 0.2) {
      completeTrip()
    }
  }, [ridingEta, ridingBus, ridingState])

  const completeTrip = () => {
    const tripInfo = ridingState ? { ...ridingState } : null
    const raw = localStorage.getItem('realtime-routes-riding')
    if (raw) {
      try {
        const riding = JSON.parse(raw)
        const history = JSON.parse(localStorage.getItem('realtime-routes-trip-history') || '[]')
        history.unshift({
          ...riding,
          routeNumber: ridingState?.routeNumber || riding.routeId,
          completedAt: Date.now(),
        })
        if (history.length > 20) history.length = 20
        localStorage.setItem('realtime-routes-trip-history', JSON.stringify(history))
      } catch {}
    }
    try {
      const riding = JSON.parse(localStorage.getItem('realtime-routes-riding') || '{}')
      if (riding.routeId) localStorage.removeItem(`realtime-routes-catch-shown-${riding.routeId}`)
    } catch {}
    localStorage.removeItem('realtime-routes-riding')
    localStorage.removeItem('realtime-routes-pinned')
    setRidingState(null)
    setPinnedStop(null)
    if (tripInfo) {
      setTripCompleted(tripInfo)
      setTimeout(() => setTripCompleted(null), 5000)
    }
  }

  const clearRiding = () => {
    localStorage.removeItem('realtime-routes-riding')
    setRidingState(null)
  }

  const pinnedBusData = useMemo(() => {
    if (!pinnedStop || !allBuses) return null
    const buses = allBuses[pinnedStop.routeId] || []
    const match = buses.find(b => b.id === pinnedStop.busId)
    if (match) return match
    if (pinnedRoute?.stops) {
      const fromStopIdx = pinnedStop.fromStopIndex ?? 0
      const totalStops = pinnedRoute.stops.length
      const fromProg = fromStopIdx / totalStops
      const approaching = buses.find(b => (b.progress || 0) < fromProg)
      if (approaching) return approaching
    }
    return buses[0] || null
  }, [pinnedStop, allBuses, pinnedRoute])

  const speedHistoryRef = useRef([])
  const prevLocalEtaRef = useRef(null)
  const prevPinnedBusProgressRef = useRef(null)
  const pinnedProgressInitRef = useRef(false)

  useEffect(() => {
    if (!pinnedStop?.halted || !pinnedBusData) {
      prevPinnedBusProgressRef.current = null
      pinnedProgressInitRef.current = false
      return
    }
    const currentProg = pinnedBusData.progress || 0
    if (!pinnedProgressInitRef.current) {
      prevPinnedBusProgressRef.current = currentProg
      pinnedProgressInitRef.current = true
      return
    }
    const prevProg = prevPinnedBusProgressRef.current
    if (prevProg !== null && currentProg !== prevProg) {
      const justRestarted = prevProg > 0.85 && currentProg < 0.15
      if (justRestarted) {
        try {
          const raw = localStorage.getItem('realtime-routes-pinned')
          if (raw) {
            const data = JSON.parse(raw)
            if (data.routeId === pinnedStop.routeId && data.halted) {
              delete data.halted
              localStorage.setItem('realtime-routes-pinned', JSON.stringify(data))
            }
          }
        } catch {}
        setPinnedStop(prev => prev ? { ...prev, halted: false } : prev)
        pinnedProgressInitRef.current = false
      }
    }
    prevPinnedBusProgressRef.current = currentProg
  }, [pinnedBusData, pinnedStop])

  const pinnedStopProgressMap = useMemo(() => {
    if (!pinnedRoute?.stops || !pinnedRoute?.coordinates?.length) return {}
    const coords = pinnedRoute.coordinates
    const totalLen = coords.length
    const map = {}
    pinnedRoute.stops.forEach((stop, idx) => {
      let minDist = Infinity
      let bestT = idx / pinnedRoute.stops.length
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
  }, [pinnedRoute])

  const localEta = useMemo(() => {
    if (!pinnedStopEtas || !pinnedStop) return null
    const fromStopIdx = pinnedStop.fromStopIndex ?? 0
    const etaData = pinnedStopEtas[fromStopIdx]
    if (!etaData || !etaData.etaMinutes) return null
    return { minutes: etaData.etaMinutes }
  }, [pinnedStopEtas, pinnedStop])

  const catchTriggeredRef = useRef(false)

  useEffect(() => {
    try {
      const key = `realtime-routes-catch-shown-${pinnedStop?.routeId || 'none'}`
      const ts = localStorage.getItem(key)
      if (ts && Date.now() - parseInt(ts) < 300000) catchTriggeredRef.current = true
      else catchTriggeredRef.current = false
    } catch {}
  }, [pinnedStop?.routeId])

  useEffect(() => {
    if (ridingState || showCatchModal || catchTriggeredRef.current) return
    if (!pinnedStop || !pinnedRoute) return
    if (pinnedStop.halted) return

    const fromStopIdx = pinnedStop.fromStopIndex
    if (fromStopIdx === null || fromStopIdx === undefined) return

    const routeStops = pinnedRoute.stops
    if (!routeStops || routeStops.length === 0) return

    let shouldCatch = false

    if (pinnedBusData) {
      const busProgress = pinnedBusData.progress || 0
      const isBusCompleted = pinnedBusData.state === 'completed'

      const fromStopProgress = pinnedStopProgressMap[fromStopIdx] ?? (fromStopIdx / routeStops.length)
      const hasReachedByProgress = busProgress >= fromStopProgress

      const isDwellingAtFrom = pinnedBusData.state === 'dwelling' && pinnedBusData.dwellStopIdx === fromStopIdx
      const isCloseToFrom = (() => {
        const fromStop = routeStops[fromStopIdx]
        if (!fromStop || !pinnedBusData.lat || !pinnedBusData.lng) return false
        return haversineDistance(pinnedBusData.lat, pinnedBusData.lng, fromStop.lat, fromStop.lng) < 0.2
      })()

      if (!isBusCompleted && (hasReachedByProgress || isDwellingAtFrom || isCloseToFrom)) {
        shouldCatch = true
      }
    }

    if (shouldCatch) {
      catchTriggeredRef.current = true
      const key = `realtime-routes-catch-shown-${pinnedStop.routeId}`
      localStorage.setItem(key, Date.now().toString())
      setShowCatchModal(true)
    }
  }, [pinnedBusData, pinnedStop, pinnedRoute, pinnedStopProgressMap, ridingState, showCatchModal])

  const handleCatchYes = () => {
    setShowCatchModal(false)
    localStorage.removeItem(`realtime-routes-catch-shown-${pinnedStop?.routeId || 'none'}`)
    const busNumber = pinnedBusData?.number || pinnedStop.busId
    localStorage.setItem('realtime-routes-riding', JSON.stringify({
      busId: pinnedStop.busId, routeId: pinnedStop.routeId, busNumber,
      fromStop: pinnedStop.fromStop, fromStopIndex: pinnedStop.fromStopIndex,
      toStop: pinnedStop.toStop, toStopIndex: pinnedStop.toStopIndex,
      startedAt: Date.now(),
    }))
    setRidingState({
      busId: pinnedStop.busId, routeId: pinnedStop.routeId, busNumber,
      fromStop: pinnedStop.fromStop, fromStopIndex: pinnedStop.fromStopIndex,
      toStop: pinnedStop.toStop, toStopIndex: pinnedStop.toStopIndex,
    })
  }

  const handleCatchNo = () => {
    setShowCatchModal(false)
    localStorage.removeItem(`realtime-routes-catch-shown-${pinnedStop?.routeId || 'none'}`)
    catchTriggeredRef.current = true
  }

  const handleClearPin = () => {
    clearPinnedStop()
    setPinnedStop(null)
  }

  const pinnedBusArrivalMinutes = useMemo(() => {
    if (!pinnedStop) return null
    if (localEta) {
      return currentTime.getHours() * 60 + currentTime.getMinutes() + localEta.minutes
    }
    if (pinnedStop.halted && pinnedBusData && pinnedRoute?.stops) {
      const fromStop = pinnedRoute.stops[pinnedStop.fromStopIndex ?? 0]
      if (fromStop && pinnedBusData.lat && pinnedBusData.lng) {
        const dist = haversineDistance(pinnedBusData.lat, pinnedBusData.lng, fromStop.lat, fromStop.lng)
        const speed = pinnedBusData.speed || 25
        const timeFactor = getTimeOfDayFactor()
        const eta = Math.max(1, Math.round((dist / speed) * 60 * timeFactor))
        return currentTime.getHours() * 60 + currentTime.getMinutes() + eta
      }
    }
    if (pinnedStop.halted && pinnedRoute?.schedule && pinnedRoute?.stops) {
      const fromIdx = pinnedStop.fromStopIndex ?? 0
      const schedEntry = pinnedRoute.schedule[fromIdx]
      if (schedEntry?.time) {
        const [h, m] = schedEntry.time.split(':').map(Number)
        return h * 60 + m
      }
    }
    return null
  }, [pinnedStop, localEta, pinnedBusData, pinnedRoute, currentTime])

  const leaveTimeData = useMemo(() => {
    const arrivalMin = pinnedBusArrivalMinutes
    if (arrivalMin === null || walkMinutes === null) return null
    const currentMin = currentTime.getHours() * 60 + currentTime.getMinutes()
    const minsUntilArrival = Math.max(0, arrivalMin - currentMin)
    const leaveTotalMin = arrivalMin - walkMinutes
    const leaveTimeStr = formatClockTime(leaveTotalMin)
    const busIdLabel = (() => {
      const busId = pinnedStop?.busId
      if (!busId) return pinnedRouteNumber || ''
      const dashIdx = busId.indexOf('-')
      if (dashIdx === -1) return busId
      return `${busId.slice(0, dashIdx)} · Bus ${busId.slice(dashIdx + 1).replace('bus-', '')}`
    })()
    return {
      minsUntilLeave: Math.max(0, leaveTotalMin - currentMin),
      minsUntilArrival,
      leaveTimeStr,
      eta: minsUntilArrival,
      busIdLabel,
      busArrivalTime: formatClockTime(arrivalMin),
      fromStop: pinnedStopName || '',
      toStop: pinnedDestinationName || '',
    }
  }, [pinnedBusArrivalMinutes, walkMinutes, pinnedStop, pinnedRouteNumber, pinnedStopName, pinnedDestinationName, currentTime])

  useEffect(() => {
    if (!notificationGranted || !leaveTimeData) return
    if (leaveTimeData.minsUntilLeave <= 5 && leaveTimeData.minsUntilLeave > 0 && !notifiedLeaveRef.current) {
      notifiedLeaveRef.current = true
      try {
        const n = new Notification('HONK LIVE', {
          body: `Leave now! ${leaveTimeData.busIdLabel} arriving at ${leaveTimeData.fromStop} in ${leaveTimeData.minsUntilArrival} min`,
          icon: '/icon-192.png',
          tag: 'honk-leave-time',
        })
        setTimeout(() => n.close(), 8000)
      } catch {}
    }
    if (leaveTimeData && leaveTimeData.minsUntilLeave > 5) {
      notifiedLeaveRef.current = false
    }
  }, [leaveTimeData, notificationGranted])

  const pinnedBusArrivesAt = pinnedBusArrivalMinutes !== null ? formatClockTime(pinnedBusArrivalMinutes) : null

  const pinnedLeaveBy = useMemo(() => {
    if (pinnedBusArrivalMinutes === null || walkMinutes === null) return null
    return calculateLeaveTime(pinnedBusArrivalMinutes, walkMinutes)
  }, [pinnedBusArrivalMinutes, walkMinutes])

  const filteredRoutes = useMemo(() => {
    if (!routes || !searchQuery.trim()) return routes || []
    const q = searchQuery.toLowerCase()
    return routes.filter(route =>
      route.name.toLowerCase().includes(q) ||
      route.number.toLowerCase().includes(q)
    )
  }, [routes, searchQuery])

  const stopResults = useMemo(() => {
    if (!searchQuery.trim() || !routeDetails) return []
    const q = searchQuery.toLowerCase()
    const results = []
    Object.entries(routeDetails).forEach(([routeId, detail]) => {
      if (!detail?.stops) return
      detail.stops.forEach((stop, idx) => {
        if (stop.name.toLowerCase().includes(q)) {
          const routeBuses = allBuses?.[routeId] || []
          const activeCount = routeBuses.filter(b =>
            b.state === 'moving' || b.state === 'dwelling'
          ).length
          results.push({ routeId, routeNumber: detail.number, stopName: stop.name, stopIndex: idx, busCount: activeCount })
        }
      })
    })
    return results.slice(0, 10)
  }, [searchQuery, routeDetails, allBuses])

  const activeBuses = useMemo(() => {
    if (!allBuses) return []
    return Object.values(allBuses).flat().filter(b =>
      b.state === 'moving' || b.state === 'dwelling'
    )
  }, [allBuses])

  const activeBusCount = activeBuses.length

  const avgSpeed = useMemo(() => {
    if (activeBuses.length === 0) return 0
    const total = activeBuses.reduce((sum, b) => sum + (b.speed || 0), 0)
    return Math.round(total / activeBuses.length)
  }, [activeBuses])

  const networkStatus = useMemo(() => {
    if (activeBuses.length === 0) return { text: 'No data', color: 'text-gray-400', icon: 'XCircle' }
    const avgSpeedVal = avgSpeed
    if (avgSpeedVal > 20) return { text: 'On time', color: 'text-emerald-600', icon: 'CheckCircle' }
    if (avgSpeedVal > 10) return { text: 'Delays', color: 'text-amber-600', icon: 'AlertTriangle' }
    return { text: 'Disrupted', color: 'text-red-600', icon: 'XCircle' }
  }, [activeBuses, avgSpeed])

  const nextBusData = useMemo(() => {
    if (!allBuses || !routeDetails) return {}
    const data = {}
    Object.entries(allBuses).forEach(([routeId, buses]) => {
      const detail = routeDetails[routeId]
      if (!detail?.stops || buses.length === 0) {
        data[routeId] = { nextEta: null, activeCount: 0, allMoving: true }
        return
      }
      const firstStop = detail.stops[0]
      const active = buses.filter(b => b.state === 'moving' || b.state === 'dwelling')
      const allMoving = active.length > 0 && active.every(b => b.state === 'moving')

      let nextEta = null
      if (firstStop && active.length > 0) {
        const closest = active.reduce((best, bus) => {
          const dist = haversineDistance(bus.lat, bus.lng, firstStop.lat, firstStop.lng)
          const eta = Math.round(Math.max(1, (dist / (bus.speed || 25)) * 60))
          if (!best || eta < best.eta) return { bus, eta }
          return best
        }, null)
        nextEta = closest?.eta || null
      }

      data[routeId] = { nextEta, activeCount: active.length, allMoving }
    })
    return data
  }, [allBuses, routeDetails])

  const tickerItems = useMemo(() => {
    if (!allBuses) return []
    const items = []
    Object.entries(allBuses).forEach(([routeId, buses]) => {
      const detail = routeDetails?.[routeId]
      buses.forEach(bus => {
        if (bus.state === 'moving' || bus.state === 'dwelling') {
          let stopName = 'Unknown'
          if (detail?.stops) {
            let minDist = Infinity
            detail.stops.forEach(stop => {
              const dist = haversineDistance(bus.lat, bus.lng, stop.lat, stop.lng)
              if (dist < minDist) { minDist = dist; stopName = stop.name }
            })
          }
          items.push({ id: bus.id, node: <><Bus className="w-3 h-3 inline-block mr-0.5" /> {bus.number} at {stopName} · {Math.round(bus.speed || 0)}km/h</> })
        }
      })
    })
    return items
  }, [allBuses, routeDetails])

  return (
    <div className="min-h-screen bg-surface-100">
      {showHomePicker && (
        <HomeLocationPicker homeLocation={homeLocation} onClose={(data) => {
          setShowHomePicker(false)
          if (data) {
            setHomeLocation(data)
            if (pinnedStop && pinnedRoute?.stops) {
              const fromStop = pinnedRoute.stops[pinnedStop.fromStopIndex ?? 0]
              if (fromStop) {
                const dist = haversineDistance(data.lat, data.lng, fromStop.lat, fromStop.lng)
                const walkMin = Math.max(1, Math.round((dist / 5) * 60))
                setWalkMinutesState(walkMin)
                setWalkMinutes(walkMin)
              }
            }
          }
        }} />
      )}
      {showWalkModal && (
        <WalkTimeModal
          onSelect={(mins) => setWalkMinutesState(mins)}
          onClose={() => setShowWalkModal(false)}
        />
      )}

      {showCatchModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="fixed inset-0 bg-black/40" />
          <div className="relative bg-white rounded-t-2xl w-full max-w-md p-6 pb-8 shadow-xl z-10 mb-[60px]">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <Bus className="w-5 h-5 text-emerald-600" />
            </div>
            <p className="text-sm font-bold text-surface-900 text-center mb-1" style={{ fontFamily: 'Chivo, sans-serif' }}>
              Bus {pinnedBusData?.number || pinnedStop?.busId} has arrived!
            </p>
            <p className="text-xs text-surface-500 text-center mb-5">
              At {pinnedStop?.fromStop} — did you catch the bus?
            </p>
            <div className="space-y-2">
              <button onClick={handleCatchYes}
                className="w-full py-3 rounded-xl text-sm font-bold bg-emerald-500 text-white hover:bg-emerald-600 transition-all"
                style={{ fontFamily: 'Chivo, sans-serif' }}>
                Yes, I'm on it!
              </button>
              <button onClick={handleCatchNo}
                className="w-full py-3 rounded-xl text-sm font-bold bg-surface-100 text-surface-700 hover:bg-surface-200 transition-all"
                style={{ fontFamily: 'Chivo, sans-serif' }}>
                No, I missed it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Info Modal */}
      {showStatusInfo && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="fixed inset-0 bg-black/40" onClick={() => setShowStatusInfo(false)} />
          <div className="relative bg-white rounded-t-2xl w-full max-w-md p-6 pb-8 shadow-xl z-10 mb-[60px]">
            <div className="w-10 h-10 rounded-full bg-surface-100 flex items-center justify-center mx-auto mb-4">
              {networkStatus.icon === 'CheckCircle' && <CheckCircle className="w-5 h-5 text-emerald-500" />}
              {networkStatus.icon === 'AlertTriangle' && <AlertTriangle className="w-5 h-5 text-amber-500" />}
              {networkStatus.icon === 'XCircle' && <XCircle className="w-5 h-5 text-red-500" />}
            </div>
            <p className="text-sm font-bold text-surface-900 text-center mb-1" style={{ fontFamily: 'Chivo, sans-serif' }}>
              Network Status: {networkStatus.text}
            </p>
            <div className="text-xs text-surface-500 text-center space-y-2 mb-5">
              {networkStatus.text === 'On time' && (
                <>
                  <p>Buses are running smoothly across all routes.</p>
                  <p>Average speed is above 20 km/h — normal traffic conditions.</p>
                </>
              )}
              {networkStatus.text === 'Delays' && (
                <>
                  <p>Some buses are running slower than usual.</p>
                  <p>Average speed is between 10–20 km/h — likely moderate to heavy traffic.</p>
                  <p className="text-surface-400">Tip: Check the live ETA on your route for exact timing.</p>
                </>
              )}
              {networkStatus.text === 'Disrupted' && (
                <>
                  <p>Buses are moving very slowly across the network.</p>
                  <p>Average speed is below 10 km/h — likely peak hour congestion or heavy rain.</p>
                  <p className="text-surface-400">Tip: Your bus may still be on time. Check your pinned trip for accurate ETA.</p>
                </>
              )}
              {networkStatus.text === 'No data' && (
                <p>No active buses right now. Check back during operating hours.</p>
              )}
            </div>
            <button onClick={() => setShowStatusInfo(false)}
              className="w-full py-2.5 rounded-xl text-sm font-bold bg-surface-900 text-white hover:bg-surface-800 transition-all"
              style={{ fontFamily: 'Chivo, sans-serif' }}>
              Got it
            </button>
          </div>
        </div>
      )}

      <div className="max-w-md mx-auto px-5 pt-8 pb-[70px]">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-black text-surface-900 tracking-tight"
              style={{ fontFamily: 'Chivo, sans-serif', letterSpacing: '-0.03em' }}>
              ⚡ HONK LIVE
            </h1>
            <p className="text-xs text-surface-500 font-medium">Mumbai Bus Tracker</p>
          </div>
          <button onClick={() => {
            if ('Notification' in window && Notification.permission === 'default') {
              Notification.requestPermission().then(p => setNotificationGranted(p === 'granted'))
            } else if ('Notification' in window && Notification.permission === 'denied') {
              alert('Notifications are blocked. Enable them in your browser settings for this site.')
            }
          }} className="relative w-10 h-10 rounded-xl bg-surface-200 flex items-center justify-center hover:bg-surface-300 transition-colors">
            <Bell className="w-5 h-5 text-surface-700" />
            {notificationGranted && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 border-2 border-surface-100 rounded-full" />}
          </button>
        </div>

        {/* Home Location */}
        <button onClick={() => setShowHomePicker(true)}
          className="w-full mb-4 p-3 rounded-xl bg-white border border-surface-200 hover:border-surface-300 transition-all flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
            <HomeIcon className="w-4.5 h-4.5 text-amber-600" />
          </div>
          <div className="flex-1 text-left">
            {homeLocation ? (
              <>
                <p className="text-xs font-bold text-surface-900 line-clamp-1" style={{ fontFamily: 'Chivo, sans-serif' }}>
                  {homeLocation.address}
                </p>
                <p className="text-[10px] text-surface-400">Your home location</p>
              </>
            ) : (
              <>
                <p className="text-xs font-bold text-surface-900" style={{ fontFamily: 'Chivo, sans-serif' }}>
                  Set your home location
                </p>
                <p className="text-[10px] text-surface-400">Tap to set for accurate leave time</p>
              </>
            )}
          </div>
          <ChevronRight className="w-4 h-4 text-surface-400 shrink-0" />
        </button>

        {/* Search Bar */}
        <div className="relative mb-4" ref={searchRef}>
          <div className="flex items-center gap-2 bg-[#f1f5f9] rounded-xl px-4 py-3">
            <Search className="w-4 h-4 text-[#64748b] shrink-0" />
            <input
              type="text"
              placeholder="Search stop or route..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              className="bg-transparent border-none outline-none text-sm text-surface-900 placeholder-[#64748b] w-full"
              style={{ fontFamily: 'Chivo, sans-serif' }}
            />
            {searchQuery && (
              <button onClick={() => { setSearchQuery(''); setSearchFocused(true) }}
                className="p-0.5 hover:bg-surface-200 rounded-full transition-colors">
                <X className="w-3.5 h-3.5 text-[#64748b]" />
              </button>
            )}
          </div>

          {searchFocused && searchQuery.trim() && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-surface-200 rounded-xl shadow-lg z-30 max-h-72 overflow-y-auto">
              {stopResults.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-surface-400 tracking-[0.1em] px-4 pt-3 pb-1"
                    style={{ fontFamily: 'Chivo, sans-serif' }}>STOPS</p>
                  {stopResults.map((r, i) => (
                    <button key={`${r.routeId}-${r.stopIndex}`}
                      onClick={() => { setSearchQuery(''); setSearchFocused(false); navigate(`/app/route/${r.routeId}?from=${r.stopIndex}`) }}
                      className="w-full text-left px-4 py-2.5 hover:bg-surface-50 flex items-center justify-between border-b border-surface-100 last:border-0 transition-colors">
                      <div>
                        <span className="text-sm font-semibold text-surface-900">{r.stopName}</span>
                        <span className="text-xs text-surface-400 ml-2">· {r.routeNumber}</span>
                      </div>
                      <span className="text-[11px] text-surface-400 shrink-0">{r.busCount} buses</span>
                    </button>
                  ))}
                </div>
              )}

              {filteredRoutes.length > 0 && searchQuery.trim() && (
                <div>
                  {stopResults.length > 0 && <div className="border-t border-surface-100" />}
                  <p className="text-[10px] font-bold text-surface-400 tracking-[0.1em] px-4 pt-3 pb-1"
                    style={{ fontFamily: 'Chivo, sans-serif' }}>ROUTES</p>
                  {filteredRoutes.map(route => (
                    <button key={route.id}
                      onClick={() => { setSearchQuery(''); setSearchFocused(false); navigate(`/app/route/${route.id}`) }}
                      className="w-full text-left px-4 py-2.5 hover:bg-surface-50 flex items-center gap-3 border-b border-surface-100 last:border-0 transition-colors">
                      <div className="w-8 h-7 rounded-lg flex items-center justify-center text-[9px] font-black shrink-0"
                        style={{ backgroundColor: getRouteColor(route.id).bg, color: getRouteColor(route.id).text, fontFamily: 'Chivo, sans-serif' }}>
                        {route.number}
                      </div>
                      <span className="text-sm text-surface-900">{route.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {stopResults.length === 0 && filteredRoutes.length === 0 && (
                <div className="px-4 py-6 text-center">
                  <p className="text-sm text-surface-400">No results found</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Live Stats Bar */}
        <div className="flex items-center justify-center gap-2.5 mb-5 no-scrollbar">
          <div className="bg-white border border-surface-200 rounded-2xl px-4 py-2.5 shrink-0 min-w-[100px] shadow-sm">
            <div className="flex items-center gap-1.5 mb-0.5">
              <Bus className="w-[14px] h-[14px] text-surface-400" />
              <span className="text-[11px] font-bold text-surface-500 tracking-[0.15em]"
                style={{ fontFamily: 'Chivo, sans-serif' }}>Active</span>
            </div>
            <p className="text-xl font-black text-surface-900" style={{ fontFamily: 'Chivo, sans-serif', lineHeight: '1.2' }}>
              {activeBusCount}
            </p>
          </div>
          <div className="bg-white border border-surface-200 rounded-2xl px-4 py-2.5 shrink-0 min-w-[100px] shadow-sm">
            <div className="flex items-center gap-1.5 mb-0.5">
              <Gauge className="w-[14px] h-[14px] text-surface-400" />
              <span className="text-[11px] font-bold text-surface-500 tracking-[0.15em]"
                style={{ fontFamily: 'Chivo, sans-serif' }}>Avg speed</span>
            </div>
            <p className="text-xl font-black text-surface-900" style={{ fontFamily: 'Chivo, sans-serif', lineHeight: '1.2' }}>
              {avgSpeed}<span className="text-sm font-bold text-surface-400 ml-0.5">km/h</span>
            </p>
          </div>
          <button onClick={() => setShowStatusInfo(true)}
            className="bg-white border border-surface-200 rounded-2xl px-4 py-2.5 shrink-0 min-w-[100px] shadow-sm text-left">
            <div className="flex items-center gap-1.5 mb-0.5">
              {networkStatus.icon === 'CheckCircle' && <CheckCircle className="w-[14px] h-[14px] text-emerald-500" />}
              {networkStatus.icon === 'AlertTriangle' && <AlertTriangle className="w-[14px] h-[14px] text-amber-500" />}
              {networkStatus.icon === 'XCircle' && <XCircle className="w-[14px] h-[14px] text-red-500" />}
              <span className="text-[11px] font-bold text-surface-500 tracking-[0.15em]"
                style={{ fontFamily: 'Chivo, sans-serif' }}>Status</span>
            </div>
            <p className={`text-xl font-black ${networkStatus.color}`}
              style={{ fontFamily: 'Chivo, sans-serif', lineHeight: '1.2' }}>
              {networkStatus.text}
            </p>
          </button>
        </div>

        {/* Onboarding Card */}
        {!pinnedStop && !onboardingDismissed && (
          <OnboardingCard onDismiss={dismissOnboarding} />
        )}

        {/* Riding Card */}
        {ridingState && (
          <div className="bg-emerald-500 rounded-2xl p-5 mb-6 text-white relative">
            <button onClick={clearRiding}
              className="absolute top-3 right-3 p-1 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[11px] font-bold tracking-[0.15em] text-white/70"
                style={{ fontFamily: 'Chivo, sans-serif' }}>ON THE BUS</span>
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-white pulse-dot" />RIDING
              </span>
            </div>
            <p className="text-sm font-bold mb-3" style={{ fontFamily: 'Chivo, sans-serif' }}>
              Bus {ridingState.busNumber} · {ridingState.fromStop} → {ridingState.toStop}
            </p>
            {ridingEta ? (
              <div className="space-y-1 text-[13px]">
                <p className="text-white/80">
                  <span className="text-white/50">Arriving in: </span>
                  <span className="font-bold text-white">{ridingEta.etaMin} min</span>
                  <span className="text-white/50"> ({ridingEta.dist} km)</span>
                </p>
                <p className="text-white/80">
                  <span className="text-white/50">Speed: </span>
                  <span className="font-bold text-white">{ridingBus?.speed || 0} km/h</span>
                </p>
              </div>
            ) : (
              <p className="text-[13px] text-white/60">Loading trip details...</p>
            )}
            {!hasRidingTicket && (
              <button onClick={() => {
                if (ridingState?.busId && ridingState?.routeId) {
                  navigate(`/app/track/${ridingState.routeId}/${ridingState.busId}?from=${ridingState.fromStopIndex}&to=${ridingState.toStopIndex}`)
                }
              }}
                className="w-full mt-3 py-2 rounded-xl text-xs font-bold bg-[#1d4ed8] text-white hover:bg-[#1e3a8a] transition-all flex items-center justify-center gap-1.5"
                style={{ fontFamily: 'Chivo, sans-serif' }}>
                Buy Ticket
              </button>
            )}
            <button onClick={() => navigate(`/app/track/${ridingState.routeId}/${ridingState.busId}?from=${ridingState.fromStopIndex}&to=${ridingState.toStopIndex}`)}
              className="w-full mt-2 py-2 rounded-xl text-xs font-bold bg-white/20 text-white hover:bg-white/30 transition-all"
              style={{ fontFamily: 'Chivo, sans-serif' }}>
              View trip →
            </button>
          </div>
        )}

        {/* Trip Completed Badge */}
        {tripCompleted && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600" />
              <p className="text-xs font-bold text-emerald-700" style={{ fontFamily: 'Chivo, sans-serif' }}>
                Trip completed — {tripCompleted.busNumber} {tripCompleted.fromStop} → {tripCompleted.toStop}
              </p>
            </div>
            <button onClick={() => setTripCompleted(null)} className="text-emerald-400 hover:text-emerald-600">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Pinned Stop Card */}
        {pinnedStop && pinnedRoute && !ridingState && (
          <div className="bg-surface-900 rounded-2xl p-5 mb-6 text-white relative">
            <button onClick={handleClearPin}
              className="absolute top-3 right-3 p-1 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[11px] font-bold tracking-[0.15em] text-white/70"
                style={{ fontFamily: 'Chivo, sans-serif' }}>MY STOP</span>
              {pinnedStop.halted ? (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />HALTED
                </span>
              ) : (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot" />LIVE
                </span>
              )}
            </div>
            <p className="text-sm font-bold mb-3" style={{ fontFamily: 'Chivo, sans-serif' }}>
              {(() => {
                const busId = pinnedStop.busId
                if (!busId) return pinnedRouteNumber
                const dashIdx = busId.indexOf('-')
                if (dashIdx === -1) return busId
                return `${busId.slice(0, dashIdx)} · Bus ${busId.slice(dashIdx + 1).replace('bus-', '')}`
              })()} &middot; {pinnedStopName}
              {pinnedDestinationName && <span className="text-white/50"> → {pinnedDestinationName}</span>}
             </p>
            {!hasTicket && (
              <button onClick={() => {
                const bid = pinnedStop.busId
                const rid = pinnedStop.routeId
                if (bid && rid) {
                  navigate(`/app/track/${rid}/${bid}?from=${pinnedStop.fromStopIndex}&to=${pinnedStop.toStopIndex}${pinnedStop.halted ? '&halted=1' : ''}`)
                }
              }}
                className="mb-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1d4ed8] text-white text-[10px] font-bold hover:bg-[#1e3a8a] transition-all"
                style={{ fontFamily: 'Chivo, sans-serif' }}>
                Buy Ticket
              </button>
            )}
             <div className="space-y-1 text-[13px]">
              {pinnedStop.halted ? (
                <>
                  <p className="text-white/80">
                    <span className="text-white/50">Status: </span>
                    <span className="font-bold text-amber-300">Halted at start</span>
                  </p>
                  <p className="text-white/80">
                    <span className="text-white/50">Bus: </span>
                    <span className="font-bold text-white">{pinnedBusArrivesAt || 'Awaiting departure'}</span>
                  </p>
                </>
              ) : (
                <>
                  <p className="text-white/80">
                    <span className="text-white/50">Bus arrives: </span>
                    <span className="font-bold text-white">{pinnedBusArrivesAt || '--'}</span>
                  </p>
                  {pinnedLeaveBy ? (
                    <p className="text-white/80">
                      <span className="text-white/50">Leave by: </span>
                      <span className="font-bold text-white">{pinnedLeaveBy}</span>
                      <button onClick={() => setShowWalkModal(true)}
                        className="ml-2 text-[11px] text-white/40 hover:text-white/70 underline">
                        Change
                      </button>
                    </p>
                  ) : (
                    <button onClick={() => setShowWalkModal(true)}
                      className="text-[11px] text-white/50 hover:text-white/80 underline">
                      Set your walk time
                    </button>
                  )}
                </>
              )}
            </div>
            <p className="text-[11px] text-white/50 mt-3">
              {pinnedStop.halted
                ? 'Bus halted at start stop — will track when it departs'
                : localEta && localEta.minutes <= 5
                ? 'Bus approaching — go now!'
                : pinnedLeaveBy
                ? `You're fine — ${Math.max(0, (localEta?.minutes || 0) - (walkMinutes || 4))} min left`
                : `Bus in ${localEta?.minutes || '--'} min`}
            </p>
          </div>
        )}

        {/* Leave In Section */}
        {!ridingState && (
        <div className="mb-6">
          <p className="text-[11px] font-bold text-surface-500 tracking-[0.15em] mb-2"
            style={{ fontFamily: 'Chivo, sans-serif' }}>LEAVE IN</p>
          {leaveTimeData ? (
            <>
              <div className="flex items-baseline gap-1">
                <span className="text-6xl font-black"
                  style={{ fontFamily: 'Chivo, sans-serif', lineHeight: '1', color: leaveTimeData.minsUntilLeave > 6 ? '#0f172a' : leaveTimeData.minsUntilLeave > 3 ? '#d97706' : '#dc2626' }}>
                  {leaveTimeData.minsUntilLeave}
                </span>
                <span className="text-xl font-bold text-surface-500"
                  style={{ fontFamily: 'Chivo, sans-serif' }}>
                  min
                </span>
              </div>
              <p className="text-xs text-surface-500 mt-1">
                {leaveTimeData.minsUntilLeave > 6
                  ? `Leave by ${leaveTimeData.leaveTimeStr} · ${leaveTimeData.busIdLabel} to ${leaveTimeData.toStop}`
                  : leaveTimeData.minsUntilLeave > 3
                  ? `⚠️ Head out soon · bus in ${leaveTimeData.eta} min`
                  : leaveTimeData.minsUntilLeave > 0
                  ? `🚨 Leave NOW · bus arriving in ${leaveTimeData.eta} min`
                  : `Bus is here — board now at ${leaveTimeData.fromStop}`}
              </p>
            </>
          ) : (
            <>
              <div className="flex items-baseline gap-1">
                <span className="text-6xl font-black text-surface-300"
                  style={{ fontFamily: 'Chivo, sans-serif', lineHeight: '1' }}>—</span>
              </div>
              <button onClick={() => navigate('/app/routes')}
                className="text-xs text-surface-500 mt-1 hover:text-surface-700 transition-colors">
                Pin a trip to see your leave time
              </button>
            </>
          )}
        </div>
        )}

        {/* Halted Pin Info */}
        {!ridingState && pinnedStop?.halted && (
        <div className="mb-6">
          <p className="text-[11px] font-bold text-surface-500 tracking-[0.15em] mb-2"
            style={{ fontFamily: 'Chivo, sans-serif' }}>STATUS</p>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-surface-900" style={{ fontFamily: 'Chivo, sans-serif' }}>
                Bus halted at start stop
              </p>
              <p className="text-xs text-surface-500">Tracking will begin when bus departs</p>
            </div>
          </div>
        </div>
        )}

        {/* Live Routes */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rounded-full bg-emerald-500 pulse-dot" />
            <p className="text-[11px] font-bold text-surface-500 tracking-[0.15em]"
              style={{ fontFamily: 'Chivo, sans-serif' }}>LIVE ROUTES</p>
          </div>

          {isLoading && (
            <div className="space-y-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="bg-white rounded-2xl p-4 shadow-sm animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-10 bg-surface-200 rounded-lg" />
                    <div className="flex-1">
                      <div className="h-4 w-32 bg-surface-200 rounded mb-2" />
                      <div className="h-3 w-20 bg-surface-200 rounded" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="text-center py-8">
              <p className="text-surface-500 text-sm mb-2">Could not load routes</p>
              <button onClick={() => window.location.reload()} className="text-xs text-blue-600 font-medium">Retry</button>
            </div>
          )}

          {filteredRoutes.length > 0 && (
            <div className="space-y-3">
              {filteredRoutes.map((route) => {
                const color = getRouteColor(route.id)
                const busInfo = nextBusData[route.id] || { nextEta: null, activeCount: 0, allMoving: true }
                return (
                  <button key={route.id} onClick={() => navigate(`/app/route/${route.id}`)} className="w-full text-left group">
                    <div className="bg-white rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-200">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-10 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0"
                          style={{ backgroundColor: color.bg, color: color.text, fontFamily: 'Chivo, sans-serif' }}>
                          {route.number}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-bold text-surface-900 truncate"
                            style={{ fontFamily: 'Chivo, sans-serif' }}>{route.name}</h3>
                          <p className="text-[11px] text-surface-500">{route.stops} stops</p>
                          {busInfo.activeCount > 0 && (
                            <p className={`text-[11px] mt-0.5 ${busInfo.allMoving ? 'text-emerald-600' : 'text-amber-600'}`}>
                              <Bus className="w-3 h-3 inline-block mr-0.5" /> {busInfo.activeCount} {busInfo.activeCount === 1 ? 'bus' : 'buses'} active
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="flex flex-col items-end gap-0.5">
                            {busInfo.nextEta !== null ? (
                              <>
                                <span className={`text-[11px] font-bold ${
                                  busInfo.nextEta < 2 ? 'text-emerald-600' :
                                  busInfo.nextEta <= 5 ? 'text-amber-600' : 'text-surface-500'
                                }`}>
                                  {busInfo.nextEta < 2 ? 'Next: NOW' : `Next: ${busInfo.nextEta} min`}
                                </span>
                                <span className="text-[10px] text-surface-400">{route.frequency}</span>
                              </>
                            ) : (
                              <span className="text-[11px] text-surface-400">{route.frequency}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {!isLoading && filteredRoutes.length === 0 && searchQuery.trim() && (
            <div className="text-center py-8">
              <p className="text-surface-500 text-sm">No routes match "{searchQuery}"</p>
            </div>
          )}

          {/* Ticker */}
          {tickerItems.length > 0 && (
            <div className="mt-6 overflow-hidden bg-[#f8fafc] rounded-xl py-2.5 border border-surface-100">
              <div className="flex gap-8 animate-scroll whitespace-nowrap" style={{ animation: 'scroll 30s linear infinite' }}>
                {tickerItems.concat(tickerItems).map((item, i) => (
                  <span key={`${item.id}-${i}`}
                    className="text-[12px] text-[#64748b] font-mono shrink-0">
                    {item.node}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  )
}