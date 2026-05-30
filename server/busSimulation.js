import routes from './data.js'

let simulationSpeed = 10 // 10x real speed for demo purposes

export function getSimulationSpeed() {
  return simulationSpeed
}

export function setSimulationSpeed(speed) {
  simulationSpeed = Math.max(1, Math.min(100, speed))
  return simulationSpeed
}

const buses = {}
const DWELL_DURATION = 0
const MIN_DWELL_MS = 0
const STOP_THRESHOLD_KM = 0.15 // within 150m of a stop to trigger dwell

function getRandomTraffic() {
  const hour = new Date().getHours()
  if (hour >= 8 && hour <= 10) return 'heavy'
  if (hour >= 17 && hour <= 20) return 'congested'
  if (hour >= 22 || hour <= 5) return 'light'
  return 'moderate'
}

function interpolateCoord(coords, t) {
  const idx = Math.floor(t)
  const frac = t - idx
  if (idx >= coords.length - 1) return coords[coords.length - 1]
  const a = coords[idx]
  const b = coords[idx + 1]
  return {
    lat: a.lat + (b.lat - a.lat) * frac,
    lng: a.lng + (b.lng - a.lng) * frac,
  }
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

function getTotalRouteDistance(coords) {
  let total = 0
  for (let i = 0; i < coords.length - 1; i++) {
    total += haversineDistance(coords[i].lat, coords[i].lng, coords[i + 1].lat, coords[i + 1].lng)
  }
  return total
}

function getSpeedForTraffic(traffic) {
  const speeds = { light: 35, moderate: 25, heavy: 18, congested: 10 }
  return speeds[traffic] || 25
}

function determineStatus(deviationMinutes) {
  if (Math.abs(deviationMinutes) < 2) return 'on-time'
  if (deviationMinutes > 2) return 'delayed'
  return 'early'
}

function getTimeOfDayFactor() {
  const hour = new Date().getHours()
  if (hour >= 8 && hour < 10) return 1.4
  if (hour >= 17 && hour < 20) return 1.45
  if (hour >= 10 && hour < 17) return 1.15
  return 1.0
}

export function initializeBuses() {
  const now = new Date()
  const minutesSinceMidnight = now.getHours() * 60 + now.getMinutes()
  const traffic = getRandomTraffic()

  routes.forEach(route => {
    const numBuses = Math.floor(Math.random() * 2) + 2
    const baseSpeed = getSpeedForTraffic(traffic)
    const totalDistKm = getTotalRouteDistance(route.coordinates)
    const totalRouteMinutes = (totalDistKm / baseSpeed) * 60
    const cycleLength = totalRouteMinutes + 5

    for (let i = 0; i < numBuses; i++) {
      const busId = `${route.id}-bus-${i + 1}`
      const busNumber = `${route.number}-${String.fromCharCode(65 + i)}`
      const offsetMinutes = (i / numBuses) * cycleLength
      const busProgress = ((minutesSinceMidnight + offsetMinutes) % cycleLength) / totalRouteMinutes
      const clampedProgress = Math.min(Math.max(busProgress, 0), 0.99)

      const totalCoords = route.coordinates.length
      const coordIndex = clampedProgress * (totalCoords - 1)
      const pos = interpolateCoord(route.coordinates, coordIndex)

      buses[busId] = {
        id: busId,
        number: busNumber,
        routeId: route.id,
        progress: clampedProgress,
        speed: baseSpeed,
        status: 'on-time',
        capacity: Math.floor(Math.random() * 40) + 10,
        scheduleDeviation: 0,
        traffic,
        lastUpdate: Date.now(),
        lat: pos.lat,
        lng: pos.lng,
        state: 'moving',
        dwellUntil: null,
        dwellStopIdx: null,
        lastCompletedAt: null,
      }
    }
  })
}

export function updateBuses() {
  const traffic = getRandomTraffic()
  const now = Date.now()

  Object.values(buses).forEach(bus => {
    const route = routes.find(r => r.id === bus.routeId)
    if (!route) return

    bus.traffic = traffic

    // Route completion - instant restart
    if (bus.state === 'completed') {
      bus.state = 'moving'
      bus.progress = 0
      bus.lastCompletedAt = null
    }

    // Move bus
    const speedFactor = getSpeedForTraffic(traffic)
    const deltaHours = (now - bus.lastUpdate) / 3600000
    const progressDelta = deltaHours * speedFactor * 0.04 * simulationSpeed
    const prevProgress = bus.progress
    bus.progress = (bus.progress + progressDelta) % 1
    bus.speed = speedFactor
    bus.lastUpdate = now

    // Detect route completion (progress wrapped from high to low)
    if (prevProgress > 0.9 && bus.progress < 0.1) {
      bus.state = 'completed'
      bus.lastCompletedAt = now
      bus.speed = 0
      bus.progress = 0.99
    }

    const totalCoords = route.coordinates.length
    const coordIndex = bus.progress * (totalCoords - 1)
    const pos = interpolateCoord(route.coordinates, coordIndex)

    bus.lat = pos.lat
    bus.lng = pos.lng

    // Find nearest stop
    let busCurrentStopIdx = 0
    let minStopDist = Infinity
    route.stops.forEach((stop, idx) => {
      const d = haversineDistance(bus.lat, bus.lng, stop.lat, stop.lng)
      if (d < minStopDist) {
        minStopDist = d
        busCurrentStopIdx = idx
      }
    })
    bus.currentStopIdx = busCurrentStopIdx

    // Always remain in moving state — no dwell pauses
    if (bus.state === 'dwelling') bus.state = 'moving'

    const currentMinutes = new Date().getHours() * 60 + new Date().getMinutes()
    const deviation = Math.min(30, Math.max(-30, currentMinutes - (480 + busCurrentStopIdx * 5)))
    bus.scheduleDeviation = deviation
    bus.status = determineStatus(deviation)
  })
}

export function getBusesForRoute(routeId) {
  return Object.values(buses)
    .filter(b => b.routeId === routeId)
    .map(b => ({
      id: b.id,
      number: b.number,
      routeId: b.routeId,
      lat: b.lat,
      lng: b.lng,
      speed: Math.round(b.speed),
      status: b.status,
      capacity: b.capacity,
      scheduleDeviation: Math.round(b.scheduleDeviation),
      traffic: b.traffic,
      progress: b.progress,
      state: b.state,
      dwellStopIdx: b.dwellStopIdx,
      currentStopIdx: b.currentStopIdx,
    }))
}

export function getAllBusPositions() {
  const byRoute = {}
  Object.values(buses).forEach(b => {
    if (!byRoute[b.routeId]) byRoute[b.routeId] = []
    byRoute[b.routeId].push({
      id: b.id,
      number: b.number,
      lat: b.lat,
      lng: b.lng,
      speed: Math.round(b.speed),
      status: b.status,
      progress: b.progress,
      state: b.state,
      dwellStopIdx: b.dwellStopIdx,
      currentStopIdx: b.currentStopIdx,
    })
  })
  return byRoute
}

export function getTrafficCondition() {
  return getRandomTraffic()
}

export function getTimeOfDayFactorExport() {
  return getTimeOfDayFactor()
}

export function getRouteDistanceAlongWaypoints(coords, fromProgress, toProgress) {
  const totalCoords = coords.length
  const fromIdx = fromProgress * (totalCoords - 1)
  const toIdx = toProgress * (totalCoords - 1)
  let distance = 0
  const start = Math.floor(fromIdx)
  const end = Math.ceil(toIdx)

  if (start >= end) return 0

  for (let i = start; i < Math.min(end, totalCoords - 1); i++) {
    distance += haversineDistance(coords[i].lat, coords[i].lng, coords[i + 1].lat, coords[i + 1].lng)
  }

  return distance
}
