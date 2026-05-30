import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { MapPin, X, Clock, ChevronRight, ArrowLeft, Bus, Navigation } from 'lucide-react'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || ''

function getPinnedStop() {
  try {
    const raw = localStorage.getItem('realtime-routes-pinned')
    if (!raw) return null
    return JSON.parse(raw)
  } catch { return null }
}

function clearPinnedStop() {
  localStorage.removeItem('realtime-routes-pinned')
}

function getTripHistory() {
  try {
    const raw = localStorage.getItem('realtime-routes-trip-history')
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function getRidingState() {
  try {
    const raw = localStorage.getItem('realtime-routes-riding')
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function formatTripDate(ts) {
  const d = new Date(ts)
  const now = new Date()
  const diffDays = Math.floor((now - d) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const ROUTE_COLORS = {
  '833LTD': { bg: '#2563eb', text: '#ffffff' },
  '91LTD': { bg: '#ef4444', text: '#ffffff' },
  '42A': { bg: '#eab308', text: '#171717' },
  'C59': { bg: '#22c55e', text: '#ffffff' },
}

function getRouteColor(routeId) {
  return ROUTE_COLORS[routeId] || { bg: '#737373', text: '#ffffff' }
}

export default function MyStopPage() {
  const navigate = useNavigate()
  const [pinnedStop, setPinnedStop] = useState(getPinnedStop())
  const [tripHistory, setTripHistory] = useState(getTripHistory)
  const [ridingState, setRidingState] = useState(getRidingState)

  const { data: route } = useQuery({
    queryKey: ['route', pinnedStop?.routeId],
    queryFn: () => axios.get(`${BACKEND_URL}/api/routes/${pinnedStop.routeId}`).then(r => r.data),
    enabled: !!pinnedStop,
  })

  const { data: buses } = useQuery({
    queryKey: ['buses', pinnedStop?.routeId],
    queryFn: () => axios.get(`${BACKEND_URL}/api/buses/${pinnedStop.routeId}`).then(r => r.data.buses || []),
    enabled: !!pinnedStop,
    refetchInterval: 2000,
  })

  useEffect(() => {
    const handler = () => {
      setTripHistory(getTripHistory())
      setRidingState(getRidingState())
    }
    window.addEventListener('storage', handler)
    const interval = setInterval(handler, 3000)
    return () => { window.removeEventListener('storage', handler); clearInterval(interval) }
  }, [])

  const handleUnpin = () => {
    clearPinnedStop()
    setPinnedStop(null)
  }

  const pinnedBus = buses?.find(b => b.id === pinnedStop?.busId)
  const fromStop = route?.stops?.[pinnedStop?.fromStopIndex]
  const toStop = route?.stops?.[pinnedStop?.toStopIndex]

  return (
    <div className="min-h-screen bg-surface-100">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-surface-100/95 backdrop-blur-md border-b border-surface-200">
        <div className="flex items-center gap-3 px-4 py-3">
          {pinnedStop && (
            <button onClick={handleUnpin} className="p-1 hover:bg-surface-200 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5 text-surface-700" />
            </button>
          )}
          <h1 className="text-base font-bold text-surface-900 flex-1" style={{ fontFamily: 'Chivo, sans-serif' }}>My Trip</h1>
          {pinnedStop && (
            <button onClick={handleUnpin}
              className="text-[11px] font-bold text-red-500 hover:text-red-600 px-3 py-1.5 rounded-lg bg-red-50 transition-all"
              style={{ fontFamily: 'Chivo, sans-serif' }}>
              Unpin
            </button>
          )}
        </div>
      </div>

      {/* No pinned trip */}
      {!pinnedStop && (
        <>
          <div className="max-w-md mx-auto px-5 pt-20 pb-8 text-center">
            <div className="w-16 h-16 rounded-full bg-surface-200 flex items-center justify-center mx-auto mb-5">
              <MapPin className="w-8 h-8 text-surface-400" />
            </div>
            <p className="text-lg font-bold text-surface-900 mb-2" style={{ fontFamily: 'Chivo, sans-serif' }}>No trip pinned yet</p>
            <p className="text-sm text-surface-500 mb-6 max-w-[250px] mx-auto">
              Browse routes and tap "Pin Trip" to track your daily commute
            </p>
            <button onClick={() => navigate('/app/routes')}
              className="px-6 py-3 rounded-xl text-sm font-bold bg-surface-900 text-white hover:bg-surface-800 transition-all"
              style={{ fontFamily: 'Chivo, sans-serif' }}>
              Browse Routes
            </button>
          </div>

          {/* Active riding trip (from Home) */}
          {ridingState && (
            <div className="max-w-md mx-auto px-5 pb-4">
              <p className="text-[11px] font-bold text-surface-500 tracking-[0.15em] mb-3"
                style={{ fontFamily: 'Chivo, sans-serif' }}>ACTIVE TRIP</p>
              <button onClick={() => navigate(`/app/track/${ridingState.routeId}/${ridingState.busId}?from=${ridingState.fromStopIndex}&to=${ridingState.toStopIndex}`)}
                className="w-full bg-emerald-500 rounded-2xl p-4 text-left shadow-sm border border-emerald-200 hover:shadow-md transition-all active:scale-[0.98]">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                    <Bus className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-white" style={{ fontFamily: 'Chivo, sans-serif' }}>
                      {ridingState.busNumber || ridingState.routeId}
                    </p>
                    <p className="text-[11px] text-white/70">
                      {ridingState.fromStop} → {ridingState.toStop}
                    </p>
                  </div>
                  <Navigation className="w-4 h-4 text-white/70" />
                </div>
                <p className="text-[11px] text-white/60">Tap to track live</p>
              </button>
            </div>
          )}

          {/* Trip history */}
          {tripHistory.length > 0 && (
            <div className="max-w-md mx-auto px-5 pb-[70px]">
              <p className="text-[11px] font-bold text-surface-500 tracking-[0.15em] mb-3"
                style={{ fontFamily: 'Chivo, sans-serif' }}>PAST TRIPS</p>
              <div className="space-y-2">
                {tripHistory.map((trip, i) => {
                  const color = getRouteColor(trip.routeId)
                  return (
                    <div key={`${trip.routeId}-${trip.startedAt}-${i}`}
                      className="bg-white rounded-2xl p-4 shadow-sm border border-surface-100">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0"
                          style={{ backgroundColor: color.bg, color: color.text, fontFamily: 'Chivo, sans-serif' }}>
                          {trip.routeNumber || trip.routeId}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-surface-900" style={{ fontFamily: 'Chivo, sans-serif' }}>
                            {trip.fromStop} → {trip.toStop}
                          </p>
                          <p className="text-[11px] text-surface-400">{formatTripDate(trip.startedAt)}</p>
                        </div>
                        {trip.completedAt && (
                          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                            {Math.round((trip.completedAt - trip.startedAt) / 60000)} min
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Pinned trip detail */}
      {pinnedStop && route && (
        <>
          <div className="max-w-md mx-auto px-5 pt-4">
            {pinnedBus ? (
              <div className="text-center mb-4">
                <p className="text-sm text-surface-500">Bus {pinnedBus.number} · {pinnedBus.speed} km/h · {pinnedBus.traffic}</p>
              </div>
            ) : (
              <div className="text-center mb-4">
                <p className="text-sm text-surface-400">Waiting for live data...</p>
              </div>
            )}

            {route.stops && (
              <div className="space-y-1.5">
                {route.stops.map((stop, idx) => {
                  const isFrom = idx === pinnedStop.fromStopIndex
                  const isTo = idx === pinnedStop.toStopIndex
                  const busStopIdx = pinnedBus?.currentStopIdx ?? -1
                  const isPassed = idx < busStopIdx

                  return (
                    <div key={stop.id}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl ${
                        isFrom ? 'bg-emerald-50 border border-emerald-200' :
                        isTo ? 'bg-blue-50 border border-blue-200' :
                        isPassed ? 'bg-surface-50' : 'bg-white border border-surface-100'
                      }`}>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                        isFrom ? 'bg-emerald-500' : isTo ? 'bg-blue-500' :
                        isPassed ? 'bg-surface-300' : 'bg-surface-900'
                      }`}>
                        <span className="text-[10px] font-bold text-white">{isFrom ? '✓' : isTo ? '✓' : idx + 1}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-semibold truncate ${
                          isFrom ? 'text-emerald-800' : isTo ? 'text-blue-800' :
                          isPassed ? 'text-surface-400' : 'text-surface-900'
                        }`} style={{ fontFamily: 'Chivo, sans-serif' }}>
                          {stop.name}
                          {isFrom && <span className="ml-1 text-emerald-600">· Board here</span>}
                          {isTo && <span className="ml-1 text-blue-600">· Destination</span>}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        {isPassed ? (
                          <span className="text-[11px] text-surface-400">Passed</span>
                        ) : (
                          <span className={`text-[11px] font-bold ${isFrom ? 'text-emerald-600' : isTo ? 'text-blue-600' : 'text-surface-600'}`}>
                            {isFrom || isTo ? 'Your stop' : idx + 1}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Track live button */}
          {pinnedBus && fromStop && toStop && (
            <div className="fixed bottom-[60px] left-0 right-0 z-40">
              <div className="max-w-md mx-auto bg-white border-t border-surface-200 shadow-[0_-4px_24px_rgba(0,0,0,0.1)] rounded-t-2xl px-5 py-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-1">
                    <p className="text-[11px] text-surface-500" style={{ fontFamily: 'Chivo, sans-serif' }}>BOARD</p>
                    <p className="text-sm font-bold text-surface-900" style={{ fontFamily: 'Chivo, sans-serif' }}>{fromStop.name}</p>
                  </div>
                  <div className="flex-1 text-right">
                    <p className="text-[11px] text-surface-500" style={{ fontFamily: 'Chivo, sans-serif' }}>DEST</p>
                    <p className="text-sm font-bold text-surface-900" style={{ fontFamily: 'Chivo, sans-serif' }}>{toStop.name}</p>
                  </div>
                </div>
                <button onClick={() => navigate(`/app/track/${pinnedStop.routeId}/${pinnedStop.busId}?from=${pinnedStop.fromStopIndex}&to=${pinnedStop.toStopIndex}`)}
                  className="w-full py-2.5 rounded-xl text-sm font-bold bg-surface-900 text-white hover:bg-surface-800 transition-all"
                  style={{ fontFamily: 'Chivo, sans-serif' }}>
                  Track live →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
