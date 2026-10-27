// Plain date helpers. Dates travel as 'YYYY-MM-DD' strings and times as 'HH:MM' or 'HH:MM:SS', so there are no time zone surprises.

export type RepeatRule =
  | { kind: 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly' }
  | { kind: 'custom'; every: number; unit: 'days' | 'weeks' | 'months' | 'years'; nth?: number; weekday?: number }

const DAY_MS = 86_400_000
const toUTC = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
const toISO = (d: Date) => d.toISOString().slice(0, 10)

export const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const nthNames: Record<number, string> = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', [-1]: 'last' }

// Today's date in the workspace's time zone.
export function todayISO(timeZone: string) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  } catch {
    return toISO(new Date())
  }
}

export const addDays = (iso: string, n: number) => toISO(new Date(toUTC(iso).getTime() + n * DAY_MS))
export const diffDays = (a: string, b: string) => Math.round((toUTC(a).getTime() - toUTC(b).getTime()) / DAY_MS)
export const weekdayOf = (iso: string) => toUTC(iso).getUTCDay()
export const isWeekend = (iso: string) => [0, 6].includes(weekdayOf(iso))

function addMonths(iso: string, n: number, dayOverride?: number) {
  const d = toUTC(iso)
  const day = dayOverride ?? d.getUTCDate()
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1))
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(day, last))
  return toISO(target)
}

// The nth weekday of the month that `iso` falls in (nth = -1 means the last one).
function nthWeekdayOfMonth(iso: string, nth: number, weekday: number) {
  const d = toUTC(iso)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  if (nth === -1) {
    const last = new Date(Date.UTC(y, m + 1, 0))
    return toISO(new Date(last.getTime() - ((last.getUTCDay() - weekday + 7) % 7) * DAY_MS))
  }
  const first = new Date(Date.UTC(y, m, 1))
  const offset = (weekday - first.getUTCDay() + 7) % 7
  return toISO(new Date(Date.UTC(y, m, 1 + offset + (nth - 1) * 7)))
}

export function nextRepeatDate(rule: RepeatRule, from: string) {
  switch (rule.kind) {
    case 'daily':
      return addDays(from, 1)
    case 'weekdays': {
      let next = addDays(from, 1)
      while (isWeekend(next)) next = addDays(next, 1)
      return next
    }
    case 'weekly':
      return addDays(from, 7)
    case 'monthly':
      return addMonths(from, 1)
    case 'yearly':
      return addMonths(from, 12)
    case 'custom': {
      const n = Math.max(1, rule.every)
      if (rule.unit === 'days') return addDays(from, n)
      if (rule.unit === 'weeks') return addDays(from, 7 * n)
      if (rule.unit === 'years') return addMonths(from, 12 * n)
      const month = addMonths(from, n, 1)
      return rule.nth && rule.weekday !== undefined ? nthWeekdayOfMonth(month, rule.nth, rule.weekday) : addMonths(from, n)
    }
  }
}

export function nextRepeatDates(rule: RepeatRule, from: string, count: number) {
  const out: string[] = []
  let current = from
  for (let i = 0; i < count; i++) {
    current = nextRepeatDate(rule, current)
    out.push(current)
  }
  return out
}

export function moveOffWeekend(iso: string, to: 'friday' | 'monday') {
  const day = weekdayOf(iso)
  if (day === 6) return addDays(iso, to === 'friday' ? -1 : 2)
  if (day === 0) return addDays(iso, to === 'friday' ? -2 : 1)
  return iso
}

export function describeRepeat(rule: RepeatRule, due: string | null) {
  const day = due ? weekdayNames[weekdayOf(due)] : null
  switch (rule.kind) {
    case 'daily':
      return 'Every day'
    case 'weekdays':
      return 'Every weekday'
    case 'weekly':
      return day ? `Every week on ${day}` : 'Every week'
    case 'monthly':
      return due ? `Every month on the ${ordinal(Number(due.slice(8)))}` : 'Every month'
    case 'yearly':
      return 'Every year'
    case 'custom': {
      const unit = rule.every === 1 ? rule.unit.slice(0, -1) : rule.unit
      const base = `Every ${rule.every === 1 ? '' : rule.every + ' '}${unit}`
      return rule.unit === 'months' && rule.nth && rule.weekday !== undefined
        ? `${base} on the ${nthNames[rule.nth]} ${weekdayNames[rule.weekday]}`
        : base
    }
  }
}

export function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// "Today", "Tomorrow", "Mon, Oct 30" (adds the year when it isn't this year).
export function formatDate(iso: string, today: string) {
  const diff = diffDays(iso, today)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  const d = toUTC(iso)
  const label = `${weekdayNames[d.getUTCDay()].slice(0, 3)}, ${monthNames[d.getUTCMonth()]} ${d.getUTCDate()}`
  return d.getUTCFullYear() === Number(today.slice(0, 4)) ? label : `${label}, ${d.getUTCFullYear()}`
}

export function formatTime(time: string) {
  const [h, m] = time.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${suffix}`
}

export const hhmm = (time: string) => time.slice(0, 5)
