// Stat cards on Dashboard and Reports drill into the page that explains them,
// handing over the period they were showing as ?date_from=&date_to=. Dates are
// parsed at local midnight so a range never slips a day against UTC.
export function rangeFromQuery(query, fallback = null) {
  if (!query?.date_from) return fallback

  const from = new Date(`${query.date_from}T00:00:00`)
  const to = query.date_to ? new Date(`${query.date_to}T00:00:00`) : new Date(from)

  return [from, to]
}
