import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Ticket, ArrowLeft, Bus, Check, X } from 'lucide-react'

function formatDate(ts) {
  const d = new Date(ts)
  const now = new Date()
  const diffDays = Math.floor((now - d) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatTime(ts) {
  const d = new Date(ts)
  const h = d.getHours()
  const m = d.getMinutes()
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

function getTickets() {
  try {
    return JSON.parse(localStorage.getItem('realtime-routes-tickets') || '[]')
  } catch { return [] }
}

export default function TicketsPage() {
  const navigate = useNavigate()
  const [tickets, setTickets] = useState(getTickets())
  const [viewingTicket, setViewingTicket] = useState(null)

  useEffect(() => {
    const handler = () => setTickets(getTickets())
    window.addEventListener('storage', handler)
    const interval = setInterval(handler, 5000)
    return () => { window.removeEventListener('storage', handler); clearInterval(interval) }
  }, [])

  return (
    <div className="min-h-screen bg-surface-100">
      <div className="sticky top-0 z-30 bg-surface-100/95 backdrop-blur-md border-b border-surface-200">
        <div className="flex items-center gap-3 px-4 py-3">
          <h1 className="text-base font-bold text-surface-900" style={{ fontFamily: 'Chivo, sans-serif' }}>My Tickets</h1>
        </div>
      </div>

      {tickets.length === 0 ? (
        <div className="max-w-md mx-auto px-5 pt-20 pb-[70px] text-center">
          <div className="w-16 h-16 rounded-full bg-surface-200 flex items-center justify-center mx-auto mb-5">
            <Ticket className="w-8 h-8 text-surface-400" />
          </div>
          <p className="text-lg font-bold text-surface-900 mb-2" style={{ fontFamily: 'Chivo, sans-serif' }}>No tickets yet</p>
          <p className="text-sm text-surface-500 mb-6 max-w-[280px] mx-auto">
            Buy your first ticket when tracking a bus
          </p>
          <button onClick={() => navigate('/app/routes')}
            className="px-6 py-3 rounded-xl text-sm font-bold bg-surface-900 text-white hover:bg-surface-800 transition-all"
            style={{ fontFamily: 'Chivo, sans-serif' }}>
            Browse Routes
          </button>
        </div>
      ) : (
        <div className="max-w-md mx-auto px-5 pt-6 pb-[70px]">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rounded-full bg-emerald-500 pulse-dot" />
            <p className="text-[11px] font-bold text-surface-500 tracking-[0.15em]"
              style={{ fontFamily: 'Chivo, sans-serif' }}>{tickets.length} TICKET{tickets.length > 1 ? 'S' : ''}</p>
          </div>

          <div className="space-y-3">
            {tickets.map((ticket) => (
              <button key={ticket.id} onClick={() => setViewingTicket(ticket)}
                className="w-full text-left group">
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-surface-100 hover:shadow-md transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-[#1d4ed8]/10 flex items-center justify-center shrink-0">
                      <Bus className="w-5 h-5 text-[#1d4ed8]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-surface-900" style={{ fontFamily: 'Chivo, sans-serif' }}>
                        {ticket.routeNumber} · {ticket.fromStop} → {ticket.toStop}
                      </p>
                      <p className="text-[11px] text-surface-500 mt-0.5">
                        {formatDate(ticket.purchasedAt)} · {formatTime(ticket.purchasedAt)} · ₹{ticket.total}
                      </p>
                      <p className="text-[10px] text-surface-400 font-mono mt-0.5 truncate">
                        TXN: {ticket.paymentId}
                      </p>
                    </div>
                    <div className="shrink-0">
                      <div className="w-8 h-8 rounded-full bg-surface-100 flex items-center justify-center group-hover:bg-surface-200 transition-colors">
                        <svg className="w-4 h-4 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* View Ticket Modal */}
      {viewingTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative bg-white rounded-2xl w-full max-w-sm mx-4 shadow-2xl overflow-hidden">
            <button onClick={() => setViewingTicket(null)}
              className="absolute top-3 right-3 z-10 p-1 rounded-full bg-black/10 hover:bg-black/20 transition-colors">
              <X className="w-4 h-4 text-white" />
            </button>
            <div className="bg-[#1d4ed8] px-6 py-4 text-center">
              <p className="text-xs font-bold text-white/70 tracking-[0.15em]" style={{ fontFamily: 'Chivo, sans-serif' }}>
                ⚡ HONK LIVE
              </p>
              <p className="text-[10px] text-white/50">Boarding Pass</p>
            </div>

            <div className="px-6 py-5">
              <div className="text-center mb-4">
                <p className="text-2xl font-black text-surface-900" style={{ fontFamily: 'Chivo, sans-serif' }}>
                  {viewingTicket.routeNumber}
                </p>
                <p className="text-xs text-surface-500">{viewingTicket.routeName}</p>
              </div>

              <div className="flex items-center justify-between mb-4 px-2">
                <div className="text-center">
                  <p className="text-[10px] text-surface-400 mb-0.5">FROM</p>
                  <p className="text-xs font-bold text-surface-900">{viewingTicket.fromStop}</p>
                </div>
                <div className="flex-1 mx-3 relative">
                  <div className="border-t border-dashed border-surface-300" />
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-surface-100 flex items-center justify-center">
                    <Bus className="w-3 h-3 text-surface-400" />
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-surface-400 mb-0.5">TO</p>
                  <p className="text-xs font-bold text-surface-900">{viewingTicket.toStop}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-surface-50 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-surface-400 mb-0.5">DATE</p>
                  <p className="text-[11px] font-bold text-surface-900">{viewingTicket.date}</p>
                </div>
                <div className="bg-surface-50 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-surface-400 mb-0.5">TIME</p>
                  <p className="text-[11px] font-bold text-surface-900">{viewingTicket.time}</p>
                </div>
                <div className="bg-surface-50 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-surface-400 mb-0.5">BUS</p>
                  <p className="text-[11px] font-bold text-surface-900">{viewingTicket.busNumber}</p>
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
                <p className="text-[9px] text-surface-400 font-mono">TXN: {viewingTicket.paymentId}</p>
                <p className="text-[9px] text-surface-400 font-mono">TKT: {viewingTicket.id}</p>
                <p className="text-[11px] font-bold text-surface-500 mt-1" style={{ fontFamily: 'Chivo, sans-serif' }}>
                  ₹{viewingTicket.total}
                </p>
              </div>

              <button onClick={() => setViewingTicket(null)}
                className="w-full py-2.5 rounded-xl text-sm font-bold bg-surface-900 text-white hover:bg-surface-800 transition-all"
                style={{ fontFamily: 'Chivo, sans-serif' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}