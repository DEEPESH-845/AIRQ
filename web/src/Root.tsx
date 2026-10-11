import { Suspense, lazy } from 'react'
import App from './App'

// /?admin is the reviewer's desk: no map, loaded only there
const Admin = lazy(() => import('./ui/Admin'))

export default function Root() {
  if (!new URLSearchParams(location.search).has('admin')) return <App />
  return (
    <Suspense fallback={null}>
      <Admin />
    </Suspense>
  )
}
