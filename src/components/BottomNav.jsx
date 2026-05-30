import { useNavigate, useLocation } from 'react-router-dom'
import { Home, Bus, MapPin, Ticket } from 'lucide-react'

const tabs = [
  { path: '/app', label: 'Home', icon: Home },
  { path: '/app/routes', label: 'Routes', icon: Bus },
  { path: '/app/my-trip', label: 'My Trip', icon: MapPin },
  { path: '/app/tickets', label: 'Tickets', icon: Ticket },
]

export default function BottomNav() {
  const navigate = useNavigate()
  const location = useLocation()

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-surface-200" style={{ height: 60 }}>
      <div className="max-w-md mx-auto h-full flex items-center justify-around">
        {tabs.map(tab => {
          const active = isActive(tab.path)
          const Icon = tab.icon
          return (
            <button key={tab.path} onClick={() => navigate(tab.path)}
              className="flex flex-col items-center gap-0.5 py-1 px-4 transition-colors">
              <Icon className="w-[22px] h-[22px]" style={{ color: active ? '#1d4ed8' : '#94a3b8' }} />
              <span className="text-[11px] font-semibold" style={{ color: active ? '#1d4ed8' : '#94a3b8', fontFamily: 'Chivo, sans-serif' }}>
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
