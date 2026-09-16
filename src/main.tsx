import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource/dm-sans/latin-400.css'
import '@fontsource/dm-sans/latin-500.css'
import '@fontsource/dm-sans/latin-600.css'
import '@fontsource/dm-sans/latin-700.css'
import '@fontsource/manrope/latin-500.css'
import '@fontsource/manrope/latin-600.css'
import '@fontsource/manrope/latin-700.css'
import '@fontsource/manrope/latin-800.css'
import 'leaflet/dist/leaflet.css'
import './styles.css'
import { CareProvider } from './state'
import App from './App'
import { AuthProvider } from './auth/AuthProvider'
import { DeviceProvider } from './device/DeviceProvider'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <DeviceProvider><CareProvider><App /></CareProvider></DeviceProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
