import express from 'express'
import cors from 'cors'
import { WebSocketServer } from 'ws'
import http from 'http'
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import routes from './data.js'
import { initializeBuses, updateBuses, getBusesForRoute, getAllBusPositions, getTrafficCondition, getSimulationSpeed, setSimulationSpeed } from './busSimulation.js'
import { predictETA, getNextDeparture, getLiveBusEtas, getStopETAs, getUpcomingArrivals } from './etaPredictor.js'
import authRoutes from './routes/auth.js'

dotenv.config()

const app = express()
const server = http.createServer(app)
const wss = new WebSocketServer({ server })

app.use(cors())
app.use(express.json())

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/honk-live')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err.message))

app.use('/api/auth', authRoutes)

const clients = new Map()

initializeBuses()

setInterval(() => {
  updateBuses()
  broadcastBusUpdates()
}, 1000)

function broadcastBusUpdates() {
  const allPositions = getAllBusPositions()
  const message = JSON.stringify({ type: 'bus-update', buses: allPositions, timestamp: Date.now() })

  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      try {
        const routeId = clients.get(client)
        if (routeId) {
          const routeBuses = allPositions[routeId] || []
          client.send(JSON.stringify({
            type: 'bus-update',
            buses: routeBuses,
            timestamp: Date.now(),
          }))
        } else {
          client.send(message)
        }
      } catch { }
    }
  })
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost')
  const routeId = url.searchParams.get('routeId')

  if (routeId) clients.set(ws, routeId)

  ws.on('close', () => {
    clients.delete(ws)
  })

  ws.on('error', () => {
    clients.delete(ws)
  })

  const initialBuses = routeId ? getBusesForRoute(routeId) : getAllBusPositions()
  ws.send(JSON.stringify({
    type: 'bus-update',
    buses: routeId ? initialBuses : initialBuses,
    timestamp: Date.now(),
  }))
})

app.get('/api/routes', (req, res) => {
  const routeList = routes.map(r => ({
    id: r.id,
    number: r.number,
    name: r.name,
    description: r.description,
    frequency: r.frequency,
    stops: r.stops?.length || 0,
    nextArrival: r.nextArrival,
  }))
  res.json(routeList)
})

app.get('/api/routes/:id', (req, res) => {
  const route = routes.find(r => r.id === req.params.id)
  if (!route) return res.status(404).json({ error: 'Route not found' })
  res.json(route)
})

app.get('/api/buses/:routeId', (req, res) => {
  const buses = getBusesForRoute(req.params.routeId)
  res.json({ routeId: req.params.routeId, buses, timestamp: Date.now() })
})

app.get('/api/predict-eta/:routeId/:stopId', (req, res) => {
  const eta = predictETA(req.params.routeId, req.params.stopId, req.query.busId || null)
  if (!eta) return res.status(404).json({ error: 'Could not calculate ETA' })
  res.json(eta)
})

app.get('/api/upcoming-arrivals/:routeId/:stopIndex', (req, res) => {
  const route = routes.find(r => r.id === req.params.routeId)
  if (!route) return res.status(404).json({ error: 'Route not found' })
  const stopIndex = parseInt(req.params.stopIndex)
  if (isNaN(stopIndex) || stopIndex < 0 || stopIndex >= (route.stops?.length || 0)) {
    return res.status(400).json({ error: 'Invalid stop index' })
  }
  const arrivals = getUpcomingArrivals(req.params.routeId, stopIndex)
  res.json({ routeId: req.params.routeId, stopIndex, stopName: route.stops[stopIndex].name, arrivals })
})

app.get('/api/alternatives/:routeId', (req, res) => {
  const currentRoute = routes.find(r => r.id === req.params.routeId)
  if (!currentRoute) return res.status(404).json({ error: 'Route not found' })

  const currentStops = new Set(currentRoute.stops?.map(s => s.name))
  const alternatives = routes
    .filter(r => r.id !== req.params.routeId)
    .map(r => {
      const sharedStops = r.stops?.filter(s => currentStops.has(s.name)).length || 0
      return {
        id: r.id,
        number: r.number,
        name: r.name,
        stops: r.stops?.length || 0,
        frequency: r.frequency,
        sharedStops,
        eta: Math.floor(Math.random() * 20) + 5,
      }
    })
    .sort((a, b) => b.sharedStops - a.sharedStops)

  res.json(alternatives)
})

app.get('/api/traffic', (req, res) => {
  res.json({ condition: getTrafficCondition(), timestamp: Date.now() })
})

app.get('/api/next-departure', (req, res) => {
  const next = getNextDeparture()
  res.json(next || { routeId: null, minutesAway: null })
})

app.get('/api/live-etas', (req, res) => {
  const etas = getLiveBusEtas()
  res.json(etas)
})

app.get('/api/stop-etas/:routeId', (req, res) => {
  const etas = getStopETAs(req.params.routeId)
  res.json(etas)
})

app.get('/api/sim-speed', (req, res) => {
  res.json({ speed: getSimulationSpeed() })
})

app.post('/api/sim-speed', (req, res) => {
  const { speed } = req.body
  if (typeof speed !== 'number' || speed < 1 || speed > 100) {
    return res.status(400).json({ error: 'Speed must be between 1 and 100' })
  }
  const newSpeed = setSimulationSpeed(speed)
  res.json({ speed: newSpeed })
})

const PORT = process.env.PORT || 3001
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
