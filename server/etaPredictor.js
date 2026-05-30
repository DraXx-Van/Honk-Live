import routes from './data.js'
import { getBusesForRoute, getAllBusPositions, getTrafficCondition, getSimulationSpeed } from './busSimulation.js'

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function getTimeOfDayFactor() {
  const hour = new Date().getHours()
  if (hour >= 7 && hour <= 10) return 1.4
  if (hour >= 17 && hour <= 20) return 1.6
  if (hour >= 22 || hour <= 5) return 0.7
  return 1.0
}

function getScheduledArrivalMinutes(schedule, stopIndex) {
  if (!schedule || !schedule[stopIndex]) return null
  const [h, m] = schedule[stopIndex].time.split(':').map(Number)
  return h * 60 + m
}

function generateInsight(etaMinutes, traffic, deviation) {
  if (etaMinutes <= 2) {
    return 'Bus approaching — get ready now.'
  }
  if (deviation >= 10) {
    return 'Bus is significantly delayed — consider alternative routes.'
  }
  if (deviation > 2) {
    return `Running ${deviation} min late due to traffic.`
  }
  if (traffic === 'light') {
    return 'Traffic is light — bus should arrive on time.'
  }
  if (traffic === 'heavy') {
    return 'Traffic is heavier than usual — minor delays expected.'
  }
  if (traffic === 'congested') {
    return 'Heavy traffic detected — expect delays.'
  }
  return 'Bus running on schedule.'
}

function calculateConfidence(bus, stopIndex, route) {
  let confidence = 94

  const hour = new Date().getHours()
  if (hour >= 8 && hour < 10) confidence -= 6
  if (hour >= 17 && hour < 20) confidence -= 8

  const busCurrentStopIdx = Math.min(
    Math.floor((bus.progress || 0) * route.stops.length),
    route.stops.length - 1
  )
  const stopsRemaining = stopIndex - busCurrentStopIdx
  if (stopsRemaining > 0) {
    confidence -= Math.min(stopsRemaining * 4, 20)
  }

  if (bus.speed < 15) confidence -= 8

  return Math.max(25, Math.min(98, confidence))
}

function getFrequencyMins(frequencyStr) {
  const match = frequencyStr?.match(/(\d+)/)
  return match ? parseInt(match[1]) : 15
}

export function predictETA(routeId, stopId, busId) {
  const route = routes.find(r => r.id === routeId)
  if (!route) return null

  const stopIndex = route.stops.findIndex(s => s.id === stopId)
  if (stopIndex === -1) return null

  const simSpeed = Math.max(1, getSimulationSpeed())
  let buses = getBusesForRoute(routeId)

  if (busId) {
    buses = buses.filter(b => b.id === busId)
  }

  const scheduledArrival = getScheduledArrivalMinutes(route.schedule, stopIndex)

  if (buses.length === 0) {
    const traffic = getTrafficCondition()
    const timeFactor = getTimeOfDayFactor()
    const baseEta = 15 + Math.random() * 10
    const etaMinutes = Math.round(baseEta * timeFactor)

    return {
      minutes: etaMinutes,
      confidence: 40,
      insight: 'No buses currently active. Estimate based on schedule.',
      traffic,
      scheduledArrival: route.schedule[stopIndex]?.time || 'Unknown',
      deviation: 0,
    }
  }

  const stop = route.stops[stopIndex]
  let minEta = Infinity
  let bestBus = null

  buses.forEach(bus => {
    const distance = haversineDistance(bus.lat, bus.lng, stop.lat, stop.lng)
    const busSpeed = bus.speed || 25
    const etaMinutes = (distance / busSpeed) * 60
    if (etaMinutes < minEta && etaMinutes > 0.5) {
      minEta = etaMinutes
      bestBus = bus
    }
  })

  if (!bestBus || minEta === Infinity) {
    return {
      minutes: Math.round(15 + Math.random() * 10),
      confidence: 35,
      insight: 'Calculating... buses are en route.',
      traffic: getTrafficCondition(),
      scheduledArrival: route.schedule[stopIndex]?.time || 'Unknown',
      deviation: 0,
    }
  }

  const traffic = getTrafficCondition()
  const timeFactor = getTimeOfDayFactor()
  const adjustedEta = Math.round(Math.max(1, minEta * timeFactor))
  const etaMinutes = adjustedEta

  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const predictedArrival = currentMinutes + etaMinutes
  const rawDeviation = scheduledArrival !== null ? predictedArrival - scheduledArrival : 0
  const deviation = Math.min(30, Math.max(-30, rawDeviation))

  const confidence = calculateConfidence(bestBus, stopIndex, route)

  const insight = generateInsight(etaMinutes, traffic, deviation)

  return {
    minutes: etaMinutes,
    confidence,
    insight,
    traffic,
    busId: bestBus.id,
    busStatus: bestBus.status,
    deviation,
    scheduledArrival: route.schedule[stopIndex]?.time || 'Unknown',
  }
}

export function getNextDeparture() {
  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  let best = null

  for (const route of routes) {
    const freqMins = getFrequencyMins(route.frequency)
    const firstScheduleMinutes = route.schedule?.[0]
      ? (() => { const [h, m] = route.schedule[0].time.split(':').map(Number); return h * 60 + m })()
      : 480

    for (let dep = firstScheduleMinutes; dep < firstScheduleMinutes + 1440; dep += freqMins) {
      if (dep > currentMinutes) {
        const minutesAway = dep - currentMinutes
        if (!best || minutesAway < best.minutesAway) {
          best = {
            routeId: route.id,
            routeNumber: route.number,
            routeName: route.name,
            departureMinutes: dep,
            departureTime: `${String(Math.floor(dep / 60)).padStart(2, '0')}:${String(dep % 60).padStart(2, '0')}`,
            minutesAway,
            stopName: route.stops?.[0]?.name || 'Unknown',
          }
        }
        break
      }
    }
  }

  return best
}

export function getLiveBusEtas() {
  const allBuses = getAllBusPositions()
  const results = []
  const simSpeed = Math.max(1, getSimulationSpeed())

  for (const route of routes) {
    const buses = allBuses[route.id] || []
    for (const bus of buses) {
      let minEta = Infinity
      let nearestStop = null
      let nearestStopIdx = 0

      route.stops.forEach((stop, idx) => {
        const distance = haversineDistance(bus.lat, bus.lng, stop.lat, stop.lng)
        const busSpeed = bus.speed || 25
        const eta = (distance / busSpeed) * 60
        if (eta < minEta && eta > 0.5) {
          minEta = eta
          nearestStop = stop
          nearestStopIdx = idx
        }
      })

      if (nearestStop && minEta < Infinity) {
        const traffic = getTrafficCondition()
        const timeFactor = getTimeOfDayFactor()
        const etaMinutes = Math.round(Math.max(1, minEta * timeFactor))
        const confidence = calculateConfidence(bus, nearestStopIdx, route)

        results.push({
          routeId: route.id,
          routeNumber: route.number,
          routeName: route.name,
          busId: bus.id,
          busNumber: bus.number,
          etaMinutes,
          confidence,
          stopName: nearestStop.name,
          stopId: nearestStop.id,
          speed: bus.speed,
          status: bus.status,
        })
      }
    }
  }

  results.sort((a, b) => a.etaMinutes - b.etaMinutes)
  return results
}

export function getStopETAs(routeId) {
  const route = routes.find(r => r.id === routeId)
  if (!route) return []

  const buses = getBusesForRoute(routeId)
  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const timeFactor = getTimeOfDayFactor()
  const simSpeed = Math.max(1, getSimulationSpeed())

  return route.stops.map((stop, stopIdx) => {
    let minEta = Infinity
    let bestBus = null

    buses.forEach(bus => {
      const busStopIdx = Math.floor((bus.progress || 0) * route.stops.length)
      if (busStopIdx >= stopIdx) return

      const distance = haversineDistance(bus.lat, bus.lng, stop.lat, stop.lng)
      const busSpeed = bus.speed || 25
      const eta = (distance / busSpeed) * 60 * timeFactor
      if (eta < minEta && eta > 0.3) {
        minEta = eta
        bestBus = bus
      }
    })

    if (bestBus && minEta < Infinity) {
      const etaMinutes = Math.round(Math.max(1, minEta))
      const arrivalTime = new Date(Date.now() + etaMinutes * 60000)
      const h = arrivalTime.getHours()
      const m = arrivalTime.getMinutes()
      const ampm = h >= 12 ? 'PM' : 'AM'
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
      return {
        stopId: stop.id,
        stopName: stop.name,
        stopIndex: stopIdx,
        status: 'upcoming',
        etaMinutes,
        etaTime: `${h12}:${String(m).padStart(2, '0')} ${ampm}`,
        busNumber: bestBus.number,
        busSpeed: Math.round(bestBus.speed),
        busTraffic: bestBus.traffic,
      }
    }

    const passed = buses.some(bus => {
      const busStopIdx = Math.floor((bus.progress || 0) * route.stops.length)
      return busStopIdx > stopIdx
    })

    return {
      stopId: stop.id,
      stopName: stop.name,
      stopIndex: stopIdx,
      status: passed ? 'passed' : 'upcoming',
      etaMinutes: null,
      etaTime: passed ? 'Passed' : '--',
      busNumber: null,
      busSpeed: null,
      busTraffic: null,
    }
  })
}

export function getUpcomingArrivals(routeId, stopIndex) {
  const route = routes.find(r => r.id === routeId)
  if (!route || !route.stops || stopIndex < 0 || stopIndex >= route.stops.length) return []

  const buses = getBusesForRoute(routeId)
  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const freqMins = getFrequencyMins(route.frequency)
  const timeFactor = getTimeOfDayFactor()
  const stop = route.stops[stopIndex]

  const liveArrivals = []

  buses.forEach(bus => {
    const busProgress = bus.progress || 0
    const totalStops = route.stops.length
    const busStopFraction = busProgress
    const stopFraction = stopIndex / totalStops

    let etaMinutes
    if (busStopFraction < stopFraction) {
      const fractionRemaining = stopFraction - busStopFraction
      const totalRouteMinutes = (getTotalRouteDistanceKm(route.coordinates) / (bus.speed || 25)) * 60
      etaMinutes = fractionRemaining * totalRouteMinutes * timeFactor
    } else {
      const fractionRemaining = (1 - busStopFraction) + stopFraction
      const totalRouteMinutes = (getTotalRouteDistanceKm(route.coordinates) / (bus.speed || 25)) * 60
      etaMinutes = fractionRemaining * totalRouteMinutes * timeFactor
    }

    etaMinutes = Math.round(Math.max(1, etaMinutes))
    const arrivalMinutes = currentMinutes + etaMinutes
    const arrivalTime = formatMinutes(arrivalMinutes)

    liveArrivals.push({
      busNumber: bus.number,
      busId: bus.id,
      etaMinutes,
      arrivalTime,
      arrivalMinutes,
      source: 'live',
      speed: Math.round(bus.speed),
      traffic: bus.traffic,
      status: bus.status,
    })
  })

  liveArrivals.sort((a, b) => a.etaMinutes - b.etaMinutes)

  return liveArrivals.slice(0, 8)
}

function getTotalRouteDistanceKm(coords) {
  let total = 0
  for (let i = 0; i < coords.length - 1; i++) {
    total += haversineDistance(coords[i].lat, coords[i].lng, coords[i + 1].lat, coords[i + 1].lng)
  }
  return total
}

function formatMinutes(totalMinutes) {
  const h = Math.floor(totalMinutes / 60) % 24
  const m = Math.round(totalMinutes % 60)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}
