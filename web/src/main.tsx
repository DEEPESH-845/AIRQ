import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/hanken-grotesk'
import '@fontsource/big-shoulders-display/600'
import '@fontsource/big-shoulders-display/800'
import './styles.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
