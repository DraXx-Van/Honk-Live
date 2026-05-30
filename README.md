# HONK LIVE — Mumbai's Real-Time Bus Tracker

> **Hackathon Submission** — Real-time bus tracking with live ETAs, home location picker, leave-time auto-calculation, trip completion detection, and PWA push notifications.

![HONK LIVE](public/icon-512.png)

## 🚀 Live Demo

- **Frontend**: _[Vercel URL]_
- **Backend**: _[Render URL]_

## ✨ Features

| Feature | Description |
|---|---|
| **Live Bus Tracking** | Real-time bus positions on interactive Leaflet maps with route-colored polylines and numbered stop markers |
| **Smart ETAs** | Distance-based ETA with time-of-day traffic factor (peak hour multiplier up to 1.45×) |
| **Home Location Picker** | Leaflet map + Nominatim geocoding — search any Mumbai address, reverse geocode, auto-calculate walk time (haversine / 5 km/h) |
| **Leave Time Countdown** | Auto-calculated from bus arrival time minus walk time; live 1-second countdown with color states (green > amber > red) |
| **Push Notifications** | Browser notification fires when leave time drops to ≤5 minutes (PWA-ready with Service Worker) |
| **Halted Bus Mode** | Buses parked at start stop shown with amber pulsing marker; auto-transitions to live tracking when bus departs |
| **Trip Completion Detection** | Auto-detected via progress wrap (>0.85 → <0.15), `state === 'completed'`, or distance < 0.2 km |
| **Catch Modal** | Prompts "Did you catch the bus?" when bus reaches your stop; starts riding trip on confirmation |
| **Trip History** | Past 20 trips saved with route-colored badges and duration |
| **Auth System** | JWT + bcryptjs auth with MongoDB; login/register with auto-redirect |
| **PWA Manifest** | `standalone` display, dark theme, service worker for push notifications |
| **Responsive Design** | Mobile-first Tailwind UI with BottomNav for protected routes |

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, Vite, Tailwind CSS, React Router v6, TanStack Query, Leaflet + React-Leaflet |
| **Backend** | Node.js, Express, WebSocket (ws), MongoDB + Mongoose |
| **Auth** | JWT (jsonwebtoken), bcryptjs |
| **Maps** | OpenStreetMap (tiles), Nominatim (geocoding) |
| **Hosting** | Vercel (frontend) + Render (backend) + MongoDB Atlas |

## 📁 Project Structure

```
├── public/
│   ├── manifest.json       # PWA manifest
│   ├── sw.js               # Service Worker (push notifications)
│   └── icon-*.png          # PWA icons
├── server/
│   ├── index.js            # Express + WebSocket server
│   ├── busSimulation.js    # Bus movement simulation engine
│   ├── data.js             # Route definitions (Mumbai routes)
│   ├── etaPredictor.js     # ETA calculation logic
│   ├── routes/auth.js      # Auth endpoints (register/login/me)
│   ├── models/User.js      # Mongoose user model
│   ├── middleware/auth.js   # JWT middleware
│   └── package.json        # Server dependencies
├── src/
│   ├── pages/
│   │   ├── LandingPage.jsx # Marketing landing page
│   │   ├── Home.jsx        # Dashboard: pinned stop, leave time, live routes
│   │   ├── BusTracker.jsx  # Real-time bus tracking map
│   │   ├── RoutesPage.jsx  # Route listing
│   │   ├── RouteDetails.jsx# Route detail with stops
│   │   ├── TripSearch.jsx  # Trip planner
│   │   ├── MyStopPage.jsx  # Pinned stop + trip history
│   │   ├── TicketsPage.jsx # Digital tickets
│   │   ├── LoginPage.jsx   # Auth login
│   │   └── RegisterPage.jsx# Auth register
│   ├── components/
│   │   ├── HomeLocationPicker.jsx  # Leaflet map picker
│   │   └── BottomNav.jsx           # App bottom navigation
│   ├── contexts/AuthContext.jsx    # Auth state provider
│   └── main.jsx           # Entry point with BrowserRouter
├── .env.example
├── package.json           # Frontend dependencies
└── vite.config.js         # Vite config
```

## 🛠️ Local Development

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)

### Setup

```bash
# Clone
git clone https://github.com/DraXx-Van/Honk-Live.git
cd Honk-Live

# Install frontend dependencies
npm install

# Install backend dependencies
cd server && npm install && cd ..

# Create .env files
echo "VITE_BACKEND_URL=http://localhost:3001" > .env
echo "MONGODB_URI=mongodb://localhost:27017/honk-live" > server/.env
echo "JWT_SECRET=your-secret-key" >> server/.env
echo "PORT=3001" >> server/.env

# Run both (frontend on :5173, backend on :3001)
npm start
```

## 🌐 Deployment

See [HOSTING.md](./HOSTING.md) for step-by-step deployment guide.

## 📹 Demo Video

_[Link to demo video]_

## 🎓 What We Learned

- Building real-time systems with WebSocket + HTTP polling fallback
- Bus movement simulation with configurable speed, dwell times, and traffic conditions
- Haversine-based ETA calculation with time-of-day traffic multipliers
- Leaflet map integration with custom markers, route polylines, and Nominatim geocoding
- Progress-wrap detection for trip completion in a polling-based architecture
- PWA push notifications via Service Worker and Notification API
- JWT auth with MongoDB and bcryptjs in an Express backend

## 👥 Team

- _[Your Name]_ — _[Your Role]_

---

**Made with ⚡ for Mumbai Commuters**
