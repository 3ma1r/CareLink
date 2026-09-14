import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { LocateFixed, MapPin, WifiOff } from 'lucide-react'
import { useCare } from '../state'
import { validCoordinates } from '../data/demo'

export function LocationMap() {
  const { location, online, patient } = useCare()
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const lat = location.coordinates?.[0],
    lng = location.coordinates?.[1]
  useEffect(() => {
    setLoaded(false)
    setFailed(false)
    if (
      !container.current ||
      lat === undefined ||
      lng === undefined ||
      !validCoordinates([lat, lng]) ||
      !online
    )
      return
    const map = L.map(container.current, { zoomControl: false, scrollWheelZoom: false }).setView(
      [lat, lng],
      14,
    )
    mapRef.current = map
    L.control.zoom({ position: 'topright' }).addTo(map)
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    })
    let gotTile = false
    const timeout = window.setTimeout(() => {
      if (!gotTile) setFailed(true)
    }, 8000)
    tiles.on('tileload', () => {
      gotTile = true
      setLoaded(true)
      setFailed(false)
      window.clearTimeout(timeout)
    })
    tiles.on('tileerror', () => {
      if (!gotTile) setFailed(true)
    })
    tiles.addTo(map)
    L.circle([lat, lng], {
      radius: 160,
      color: '#00867e',
      weight: 1,
      fillColor: '#36bca2',
      fillOpacity: 0.13,
    }).addTo(map)
    const markerContent = document.createElement('div')
    if (patient.avatar) {
      const portrait = document.createElement('img')
      portrait.src = '/assets/patient-avatar.svg'
      portrait.alt = 'Sample patient marker'
      markerContent.append(portrait)
    } else {
      const initials = document.createElement('span')
      initials.className = 'map-marker-initials'
      initials.textContent = patient.name.slice(0, 2).toUpperCase()
      markerContent.append(initials)
    }
    const icon = L.divIcon({
      className: 'patient-map-marker',
      html: markerContent,
      iconSize: [62, 72],
      iconAnchor: [31, 70],
    })
    L.marker([lat, lng], { icon, alt: 'Sample patient location' })
      .addTo(map)
      .bindPopup('Fictional sample location. See the GPS-fix time below.')
    return () => {
      window.clearTimeout(timeout)
      map.remove()
      mapRef.current = null
    }
  }, [lat, lng, online, retry, patient.avatar, patient.name])
  const available = validCoordinates(location.coordinates)
  const preview = !online || failed || !loaded
  return (
    <div className={`map-area ${preview ? 'map-preview-mode' : ''}`}>
      <div
        ref={container}
        className="leaflet-map"
        role="region"
        aria-label="Map showing fictional sample coordinates in Muscat"
        style={{ visibility: available && !preview ? 'visible' : 'hidden' }}
      />
      {(!available || preview) && (
        <div className="map-fallback">
          <svg viewBox="0 0 800 520" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            <rect width="800" height="520" fill="var(--map-land)" />
            <path d="M420-30q-110 95 19 168t231 121L840 81V-30" fill="var(--map-water)" />
            <g fill="var(--map-park)">
              <path d="m130 90 70 20-26 68-90-17Z" />
              <path d="m530 356 88 31-34 85-71-24Z" />
              <path d="m232 250 46 19-17 86-51-29Z" />
            </g>
            <g stroke="var(--map-road)" strokeWidth="8" fill="none">
              <path d="m-40 330 289-192 432 442M-20 150l466 389M105-40l-30 553M295-30l-170 575M475 131l-233 420M-20 450l432-121 459 51M-25 59l335 123 415 131" />
              <path d="m191-20 62 245 486 317M-40 250l330 191 550-37" strokeWidth="4" />
            </g>
            <path
              d="m-40 498 310-141 190-143L365-30"
              stroke="var(--map-highway)"
              strokeWidth="12"
              fill="none"
            />
            <path
              d="m-40 498 310-141 190-143L365-30"
              stroke="var(--map-road)"
              strokeWidth="5"
              fill="none"
            />
          </svg>
          <div className="map-preview-label">
            <MapPin size={15} />
            Illustrative map preview · Not accurate geography
          </div>
          <div className="map-fallback-message">
            <span className="map-placeholder-icon">
              {available ? <WifiOff size={30} /> : <MapPin size={30} />}
            </span>
            <strong>
              {!available
                ? 'GPS location unavailable'
                : !online
                  ? 'Map unavailable offline'
                  : failed
                    ? 'Live map tiles unavailable'
                    : 'Loading the map…'}
            </strong>
            <p>
              {available
                ? 'Sample coordinates and the Maps link remain available below.'
                : 'A marker will appear only after a valid GPS fix.'}
            </p>
            {available && online && failed && (
              <button
                className="button secondary"
                onClick={() => {
                  setLoaded(false)
                  setFailed(false)
                  setRetry((n) => n + 1)
                }}
              >
                Retry live map
              </button>
            )}
          </div>
        </div>
      )}
      {available && !preview && (
        <>
          <span className="map-live-label">Sample patient location</span>
          <button
            className="map-recenter icon-button"
            aria-label="Center map on sample patient"
            onClick={() => {
              if (location.coordinates) mapRef.current?.setView(location.coordinates, 14)
            }}
          >
            <LocateFixed size={24} />
          </button>
        </>
      )}
    </div>
  )
}
