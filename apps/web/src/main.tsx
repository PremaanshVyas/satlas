import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import './index.css'
import App from './App.tsx'
import ApiDocs from './pages/ApiDocs.tsx'
import Maintenance from './components/Maintenance.tsx'

// Set VITE_MAINTENANCE=1 in Vercel to take the whole site to a maintenance screen
// (e.g. while the satellite catalog has no valid data to serve). Dormant by default.
const MAINTENANCE = import.meta.env.VITE_MAINTENANCE === '1'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {MAINTENANCE ? (
      <Maintenance />
    ) : (
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/docs" element={<ApiDocs />} />
        </Routes>
      </BrowserRouter>
    )}
    <Analytics />
    <SpeedInsights />
  </StrictMode>,
)
