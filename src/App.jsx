import { Routes, Route, useLocation, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import Home from './pages/Home'
import TripSearch from './pages/TripSearch'
import BusTracker from './pages/BusTracker'
import RoutesPage from './pages/RoutesPage'
import MyStopPage from './pages/MyStopPage'
import TicketsPage from './pages/TicketsPage'
import BottomNav from './components/BottomNav'
import './App.css'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen bg-surface-100 flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-surface-300 border-t-surface-900 rounded-full animate-spin" />
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  return children
}

function AppRoutes() {
  const location = useLocation()
  const isLanding = location.pathname === '/'
  const isAuth = location.pathname === '/login' || location.pathname === '/register'

  return (
    <div className="min-h-screen bg-surface-100">
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/app" element={<ProtectedRoute><Home /></ProtectedRoute>} />
        <Route path="/app/routes" element={<ProtectedRoute><RoutesPage /></ProtectedRoute>} />
        <Route path="/app/my-trip" element={<ProtectedRoute><MyStopPage /></ProtectedRoute>} />
        <Route path="/app/tickets" element={<ProtectedRoute><TicketsPage /></ProtectedRoute>} />
        <Route path="/app/route/:routeId" element={<ProtectedRoute><TripSearch /></ProtectedRoute>} />
        <Route path="/app/track/:routeId/:busId" element={<ProtectedRoute><BusTracker /></ProtectedRoute>} />
      </Routes>
      {!isLanding && !isAuth && <BottomNav />}
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
