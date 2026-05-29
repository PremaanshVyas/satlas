import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import './index.css'
import App from './App.tsx'
import ApiDocs from './pages/ApiDocs.tsx'
import Maintenance from './components/Maintenance.tsx'

// Set VITE_MAINTENANCE=1 in Vercel to show a maintenance screen on the globe route
// (e.g. while the satellite catalog has no valid data to serve). The static API docs
// at /docs don't depend on the catalog, so they stay available. Dormant by default.
const MAINTENANCE = import.meta.env.VITE_MAINTENANCE === '1'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={MAINTENANCE ? <Maintenance /> : <App />} />
        <Route path="/docs" element={<ApiDocs />} />
      </Routes>
    </BrowserRouter>
    <Analytics />
    <SpeedInsights />
  </StrictMode>,
)
