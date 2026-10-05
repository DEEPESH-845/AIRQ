import { useEffect, useState } from 'react'

/** The current time, refreshed every `ms`: components that compare against "now" stay right across midnight
 *  and code expiry without reading the clock during render. */
export function useNow(ms = 30000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}
