// Common time zones, with the short names people use.
export const timeZones = [
  ['America/New_York', 'Eastern'],
  ['America/Chicago', 'Central'],
  ['America/Denver', 'Mountain'],
  ['America/Phoenix', 'Arizona'],
  ['America/Los_Angeles', 'Pacific'],
  ['America/Anchorage', 'Alaska'],
  ['Pacific/Honolulu', 'Hawaii'],
  ['America/Toronto', 'Toronto'],
  ['Europe/London', 'London'],
  ['Europe/Paris', 'Paris'],
  ['Africa/Lagos', 'Lagos'],
  ['Asia/Dubai', 'Dubai'],
  ['Asia/Kolkata', 'India'],
  ['Asia/Singapore', 'Singapore'],
  ['Asia/Tokyo', 'Tokyo'],
  ['Australia/Sydney', 'Sydney'],
  ['UTC', 'UTC'],
].map(([value, label]) => ({ value, label }))

export const zoneLabel = (zone: string | null) => (zone ? (timeZones.find((z) => z.value === zone)?.label ?? zone.replace(/_/g, ' ')) : '')
