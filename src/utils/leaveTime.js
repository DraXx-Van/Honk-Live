export function formatClockTime(totalMinutes) {
  const rounded = Math.round(totalMinutes)
  const h = Math.floor(rounded / 60) % 24
  const m = rounded % 60
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

export function calculateLeaveTime(busArrivalMinutes, walkMinutes) {
  if (busArrivalMinutes === null || busArrivalMinutes === undefined || walkMinutes === null) return null
  const now = new Date()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const totalMin = busArrivalMinutes - walkMinutes
  if (totalMin <= nowMinutes) return 'Now'
  return formatClockTime(totalMin)
}

export function getWalkMinutes() {
  try {
    const raw = localStorage.getItem('realtime-routes-walk')
    return raw ? JSON.parse(raw).walkMinutes : null
  } catch { return null }
}

export function setWalkMinutes(mins) {
  localStorage.setItem('realtime-routes-walk', JSON.stringify({ walkMinutes: mins }))
}
