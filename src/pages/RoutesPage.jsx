import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { ArrowLeft, Clock } from 'lucide-react'

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

export default function RoutesPage() {
  const navigate = useNavigate()

  const { data: routes, isLoading } = useQuery({
    queryKey: ['routes'],
    queryFn: () => axios.get(`${BACKEND_URL}/api/routes`).then(r => r.data),
    refetchInterval: 30000,
  })

  return (
    <div className="min-h-screen bg-surface-100">
      <div className="sticky top-0 z-30 bg-surface-100/95 backdrop-blur-md border-b border-surface-200">
        <div className="flex items-center gap-3 px-4 py-3">
          <h1 className="text-base font-bold text-surface-900" style={{ fontFamily: 'Chivo, sans-serif' }}>All Routes</h1>
        </div>
      </div>

      <div className="max-w-md mx-auto px-5 pt-6 pb-24">
        <div className="flex items-center gap-2 mb-5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 pulse-dot" />
          <p className="text-[11px] font-bold text-surface-500 tracking-[0.15em]"
            style={{ fontFamily: 'Chivo, sans-serif' }}>LIVE ROUTES</p>
        </div>

        {isLoading ? (
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
        ) : routes && routes.length > 0 ? (
          <div className="space-y-3">
            {routes.map(route => {
              const color = getRouteColor(route.id)
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
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 text-surface-400">
                          <Clock className="w-3 h-3" />
                          <span className="text-[11px]">{route.frequency}</span>
                        </div>
                        <div className="w-6 h-6 rounded-full bg-surface-100 flex items-center justify-center">
                          <svg className="w-3 h-3 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-surface-500 text-sm">No routes available</p>
          </div>
        )}
      </div>

    </div>
  )
}
