import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './styles/global.css'
import App from './App.tsx'
import { initSpeechService } from './domains/speech/speechService'

initSpeechService()

if (import.meta.env.DEV) {
  import('./lib/devSeed').then(({ loadDemoGuestData }) => {
    ;(window as unknown as { __loadDemoData: typeof loadDemoGuestData }).__loadDemoData = loadDemoGuestData
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
