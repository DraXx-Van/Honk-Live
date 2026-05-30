import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Zap, MapPin, Clock, Ticket, Shield, Route, ChevronDown, ChevronRight, Bus, ArrowRight, Star, Users, Navigation, LogOut } from 'lucide-react'

const FAQ_ITEM = ({ q, a }) => {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-white/10">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between py-4 text-left">
        <span className="text-sm font-semibold text-white">{q}</span>
        <ChevronDown className={`w-4 h-4 text-white/40 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <p className="pb-4 text-sm text-white/50 leading-relaxed">{a}</p>}
    </div>
  )
}

export default function LandingPage() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center">
              <Zap className="w-5 h-5 text-black" />
            </div>
            <span className="text-lg font-bold" style={{ fontFamily: 'Chivo, sans-serif' }}>HONK LIVE</span>
          </div>
          {user ? (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-xs font-bold text-amber-400">
                {user.name?.[0]?.toUpperCase() || 'U'}
              </div>
              <button onClick={() => navigate('/app')}
                className="px-5 py-2 rounded-full bg-amber-500 text-black text-sm font-semibold hover:bg-amber-400 transition-all">
                Open App
              </button>
              <button onClick={logout}
                className="p-2 rounded-full text-white/30 hover:text-white/60 transition-colors">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={() => navigate('/login')}
                className="px-4 py-2 rounded-full border border-white/20 text-sm font-semibold hover:bg-white hover:text-black transition-all">
                Sign In
              </button>
              <button onClick={() => navigate('/app')}
                className="px-5 py-2 rounded-full bg-amber-500 text-black text-sm font-semibold hover:bg-amber-400 transition-all">
                Open App
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-amber-500/5 to-transparent" />
        <div className="max-w-6xl mx-auto px-6 pt-20 pb-24 relative">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 mb-6">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-xs font-semibold text-amber-400 tracking-wider">LIVE IN MUMBAI</span>
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black leading-[1.05] mb-6" style={{ fontFamily: 'Chivo, sans-serif' }}>
                Know exactly<br />
                when your bus<br />
                <span className="text-amber-500">arrives.</span>
              </h1>
              <p className="text-base text-white/50 max-w-md mb-8 leading-relaxed">
                Real-time bus tracking for Mumbai. See every bus on every route, know your leave time, and never miss your ride again.
              </p>
              <div className="flex flex-wrap gap-3">
                <button onClick={() => navigate('/app')}
                  className="px-6 py-3 rounded-xl bg-amber-500 text-black font-bold text-sm hover:bg-amber-400 transition-all flex items-center gap-2">
                  Start Tracking <ArrowRight className="w-4 h-4" />
                </button>
                <button onClick={() => navigate('/app')}
                  className="px-6 py-3 rounded-xl border border-white/10 text-white/70 font-semibold text-sm hover:border-white/30 hover:text-white transition-all">
                  View Live Routes
                </button>
              </div>
              <div className="flex items-center gap-6 mt-8 text-xs text-white/30">
                <span className="flex items-center gap-1"><Users className="w-3 h-3" /> 10+ active buses</span>
                <span className="flex items-center gap-1"><Route className="w-3 h-3" /> 4 routes live</span>
                <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> Free forever</span>
              </div>
            </div>
            <div className="relative hidden lg:block">
              <div className="w-72 h-[500px] rounded-[2.5rem] bg-surface-900 border-4 border-surface-700 p-3 shadow-2xl shadow-amber-500/5 mx-auto">
                <div className="w-full h-full rounded-[2rem] bg-surface-800 overflow-hidden relative">
                  <div className="absolute inset-0 bg-gradient-to-b from-amber-500/10 to-transparent" />
                  <div className="p-4 pt-8">
                    <div className="text-[10px] font-bold text-white/40 tracking-widest mb-2">LIVE TRACKING</div>
                    <div className="bg-surface-900 rounded-xl p-3 mb-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold">833LTD</span>
                        <span className="text-[10px] text-emerald-400">3 min</span>
                      </div>
                      <div className="w-full bg-surface-700 rounded-full h-1.5">
                        <div className="bg-amber-500 h-full rounded-full" style={{ width: '65%' }} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      {['Andheri Depot', 'Andheri Station', 'MIDC', 'Chakala'].map((stop, i) => (
                        <div key={stop} className="flex items-center gap-2 px-2">
                          <div className={`w-2 h-2 rounded-full ${i < 2 ? 'bg-amber-500' : 'bg-surface-600'}`} />
                          <span className={`text-[10px] ${i < 2 ? 'text-white/40 line-through' : 'text-white/70'}`}>{stop}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="absolute bottom-4 left-4 right-4 bg-amber-500 rounded-lg p-2 text-center">
                    <span className="text-[10px] font-bold text-black">BUY TICKET</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="border-y border-white/5 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto px-6 py-6 grid grid-cols-3 gap-6">
          {[
            { label: 'Active Buses', value: '10+', icon: Bus },
            { label: 'Routes Covered', value: '4', icon: Route },
            { label: 'Avg Speed', value: '25 km/h', icon: Navigation },
          ].map(stat => (
            <div key={stat.label} className="text-center">
              <stat.icon className="w-5 h-5 text-amber-500 mx-auto mb-2" />
              <div className="text-xl font-black" style={{ fontFamily: 'Chivo, sans-serif' }}>{stat.value}</div>
              <div className="text-[10px] text-white/30 uppercase tracking-wider">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-xs font-bold text-amber-500 tracking-[0.2em] mb-3">HOW IT WORKS</p>
            <h2 className="text-3xl sm:text-4xl font-black" style={{ fontFamily: 'Chivo, sans-serif' }}>
              Three taps to your bus.
            </h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-8">
            {[
              { step: '01', title: 'Pick your route', desc: 'Choose from live Mumbai bus routes — Andheri, Borivali, CSMT, and more.', icon: Route },
              { step: '02', title: 'Select your stop', desc: 'Tap your boarding point and destination. We calculate the exact leave time.', icon: MapPin },
              { step: '03', title: 'Track & go', desc: 'Watch your bus approach in real-time. Get alerted when it\'s time to leave.', icon: Clock },
            ].map(item => (
              <div key={item.step} className="p-6 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-amber-500/20 transition-all group">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center mb-4 group-hover:bg-amber-500/20 transition-all">
                  <item.icon className="w-5 h-5 text-amber-500" />
                </div>
                <div className="text-xs font-bold text-amber-500/50 mb-2">STEP {item.step}</div>
                <h3 className="text-lg font-bold mb-2" style={{ fontFamily: 'Chivo, sans-serif' }}>{item.title}</h3>
                <p className="text-sm text-white/40 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-xs font-bold text-amber-500 tracking-[0.2em] mb-3">FEATURES</p>
            <h2 className="text-3xl sm:text-4xl font-black" style={{ fontFamily: 'Chivo, sans-serif' }}>
              Everything you need to<br />catch your bus.
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { title: 'Live Bus Tracking', desc: 'See every bus moving on the map in real-time. Position, speed, and ETA updated every second.', icon: Navigation },
              { title: 'Smart Leave Time', desc: 'We calculate when to leave home based on bus position, your walk time, and traffic.', icon: Clock },
              { title: 'Buy Tickets', desc: 'Purchase tickets directly from the app. No cash, no queues.', icon: Ticket },
              { title: 'Route Planner', desc: 'Select your FROM and TO stops. See all available buses and pick the fastest one.', icon: Route },
              { title: 'Pin Your Stop', desc: 'Pin your daily commute. See live ETAs and leave time on the home screen.', icon: MapPin },
              { title: 'Multi-Speed Simulation', desc: 'Speed up tracking 1x to 50x for demos and testing. Watch buses zip across the map.', icon: Zap },
            ].map(feature => (
              <div key={feature.title} className="p-5 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-amber-500/20 transition-all">
                <feature.icon className="w-5 h-5 text-amber-500 mb-3" />
                <h3 className="text-sm font-bold mb-1.5">{feature.title}</h3>
                <p className="text-xs text-white/40 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Coverage */}
      <section className="py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-xs font-bold text-amber-500 tracking-[0.2em] mb-3">COVERAGE</p>
            <h2 className="text-3xl sm:text-4xl font-black" style={{ fontFamily: 'Chivo, sans-serif' }}>
              Across Mumbai.
            </h2>
            <p className="text-sm text-white/40 mt-3 max-w-md mx-auto">
              Real-time tracking on major routes connecting Andheri, BKC, Borivali, CSMT, Bandra and more.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            {['Andheri', 'BKC', 'Borivali', 'CSMT', 'Bandra', 'MIDC', 'Santacruz', 'Khar', 'Goregaon', 'Jogeshwari'].map(area => (
              <span key={area} className="px-4 py-2 rounded-full bg-white/[0.03] border border-white/5 text-xs font-semibold text-white/50 hover:border-amber-500/30 hover:text-amber-400 transition-all cursor-default">
                {area}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-xs font-bold text-amber-500 tracking-[0.2em] mb-3">WHAT COMMUTERS SAY</p>
            <h2 className="text-3xl sm:text-4xl font-black" style={{ fontFamily: 'Chivo, sans-serif' }}>
              Trusted by Mumbai commuters.
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { text: 'I used to stand at the bus stop for 20 minutes every morning. Now I leave exactly when I need to.', name: 'Priya S.', handle: 'Andheri → BKC' },
              { text: 'The leave time feature is a game changer. I haven\'t been late to office in weeks.', name: 'Rahul M.', handle: 'Borivali → MIDC' },
              { text: 'Finally something that works for Mumbai buses. Real-time tracking that actually updates.', name: 'Anita K.', handle: 'CSMT → Bandra' },
              { text: 'My wife uses it daily. The pin feature means she doesn\'t have to set it up every morning.', name: 'Vikram T.', handle: 'Santacruz → BKC' },
              { text: 'I track 3 different routes. The route planner makes it easy to compare options.', name: 'Sneha D.', handle: 'Goregaon → Andheri' },
              { text: 'No more guessing when the bus will come. I see it approaching and leave right on time.', name: 'Arjun P.', handle: 'Khar → MIDC' },
            ].map((t, i) => (
              <div key={i} className="p-5 rounded-2xl bg-white/[0.03] border border-white/5">
                <div className="flex gap-0.5 mb-3">
                  {[1,2,3,4,5].map(s => <Star key={s} className="w-3 h-3 fill-amber-500 text-amber-500" />)}
                </div>
                <p className="text-xs text-white/60 leading-relaxed mb-4">"{t.text}"</p>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-surface-700 flex items-center justify-center text-[10px] font-bold text-white/50">
                    {t.name[0]}
                  </div>
                  <div>
                    <p className="text-xs font-semibold">{t.name}</p>
                    <p className="text-[10px] text-white/30">{t.handle}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="py-24">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-xs font-bold text-amber-500 tracking-[0.2em] mb-3">COMPARISON</p>
            <h2 className="text-3xl sm:text-4xl font-black" style={{ fontFamily: 'Chivo, sans-serif' }}>
              Why HONK LIVE?
            </h2>
          </div>
          <div className="rounded-2xl border border-white/5 overflow-hidden">
            <div className="grid grid-cols-4 text-xs font-semibold bg-white/[0.03] border-b border-white/5">
              <div className="p-4 text-white/30"></div>
              <div className="p-4 text-center text-white/40">Guessing</div>
              <div className="p-4 text-center text-white/40">Google Maps</div>
              <div className="p-4 text-center text-amber-500 font-bold">HONK LIVE</div>
            </div>
            {[
              { label: 'Real-time position', a: '—', b: '—', c: '✓' },
              { label: 'Leave time calc', a: '—', b: '—', c: '✓' },
              { label: 'Buy tickets', a: '—', b: '—', c: '✓' },
              { label: 'Bus speed & traffic', a: '—', b: '—', c: '✓' },
              { label: 'Multi-route tracking', a: '—', b: 'Partial', c: '✓' },
              { label: 'Pin to home screen', a: '—', b: '—', c: '✓' },
            ].map((row, i) => (
              <div key={i} className={`grid grid-cols-4 text-xs border-b border-white/5 ${i % 2 === 0 ? 'bg-white/[0.01]' : ''}`}>
                <div className="p-3 text-white/50 font-medium">{row.label}</div>
                <div className="p-3 text-center text-white/20">{row.a}</div>
                <div className="p-3 text-center text-white/30">{row.b}</div>
                <div className="p-3 text-center text-amber-500 font-bold">{row.c}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-24 bg-white/[0.02]">
        <div className="max-w-2xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-black" style={{ fontFamily: 'Chivo, sans-serif' }}>Questions? Answers.</h2>
            <p className="text-sm text-white/40 mt-2">Everything you need to know.</p>
          </div>
          <div>
            <FAQ_ITEM q="Is it free?" a="Yes, HONK LIVE is completely free to use. No subscriptions, no hidden charges. Ticket purchases are separate and handled through official BEST portals." />
            <FAQ_ITEM q="How accurate is the tracking?" a="We use real-time simulation data updated every second. Bus positions, speeds, and ETAs reflect current conditions including traffic." />
            <FAQ_ITEM q="Which routes are covered?" a="Currently we cover 4 major Mumbai routes: Andheri-BKC Express, Borivali-Andheri, CSMT-Bandra, and Colaba-Grant Road. More routes coming soon." />
            <FAQ_ITEM q="Do I need to create an account?" a="No account needed. Just open the app and start tracking. Your pinned stops and preferences are saved locally on your device." />
            <FAQ_ITEM q="Can I track multiple buses at once?" a="Yes! You can view all active buses on any route. The route planner shows every bus with its ETA so you can pick the best one." />
            <FAQ_ITEM q="How does the leave time work?" a="We calculate your leave time based on the bus's real-time position, the distance to your stop, your walking speed, and current traffic conditions." />
            <FAQ_ITEM q="Will more routes be added?" a="Absolutely. We're expanding to cover more BEST routes across Mumbai. Each new route goes live as soon as we have the route data and simulation ready." />
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-black mb-4" style={{ fontFamily: 'Chivo, sans-serif' }}>
            Your bus is waiting.
          </h2>
          <p className="text-sm text-white/40 mb-8">
            Track live buses, know your leave time, and never miss your ride again.
          </p>
          <button onClick={() => navigate('/app')}
            className="px-8 py-4 rounded-xl bg-amber-500 text-black font-bold text-base hover:bg-amber-400 transition-all inline-flex items-center gap-2">
            Start Tracking Now <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-amber-500 flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-black" />
            </div>
            <span className="text-sm font-bold" style={{ fontFamily: 'Chivo, sans-serif' }}>HONK LIVE</span>
            <span className="text-xs text-white/20 ml-2">Mumbai Bus Tracker</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-white/30">
            <span>Made with ❤ for Mumbai</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
