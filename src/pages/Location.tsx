import { ExternalLink, MapPin, Navigation, ShieldCheck, Timer, WifiOff } from 'lucide-react'
import { useCare } from '../state'
import { stamp, validCoordinates } from '../data/demo'
import { Avatar, Badge, DeviceCard, PageHeading, SectionTitle } from '../components/UI'
import { LocationMap } from '../components/LocationMap'
export default function Location() {
  const { patient, location, scenario } = useCare()
  const valid = validCoordinates(location.coordinates)
  return (
    <>
      <PageHeading
        title="Location"
        subtitle={<>{patient.name}’s last known location, with the details that matter.</>}
        action={
          <Badge tone={!valid || location.stale ? 'amber' : 'teal'}>
            <MapPin size={14} />
            {!valid ? 'GPS unavailable' : location.stale ? 'Stale GPS fix' : 'Sample GPS fix'}
          </Badge>
        }
      />
      <div className="location-layout">
        <section className="card map-card">
          <LocationMap />
          <div className="location-patient">
            <Avatar />
            <div>
              <h2>{patient.name}’s location</h2>
              <p>
                <MapPin size={15} />
                {valid ? `${patient.city}, Oman` : 'Waiting for a valid location'}
              </p>
              <small>Last GPS fix · {stamp(location.time)}</small>
            </div>
            {valid && (
              <a
                className="button primary"
                target="_blank"
                rel="noopener noreferrer"
                href={`https://www.google.com/maps/search/?api=1&query=${location.coordinates![0]},${location.coordinates![1]}`}
              >
                Open in Maps
                <ExternalLink size={17} />
              </a>
            )}
          </div>
          <div className="map-device">
            <DeviceCard compact />
          </div>
        </section>
        <aside className="location-aside">
          <section className="card location-details">
            <SectionTitle title="Location details" icon={<Navigation size={21} />} />
            <div className="detail-item">
              <MapPin size={19} />
              <div>
                <span>Displayed coordinates</span>
                <strong>
                  {valid
                    ? `${location.coordinates![0].toFixed(4)}° N, ${location.coordinates![1].toFixed(4)}° E`
                    : 'Unavailable'}
                </strong>
                <small>Fictional sample location</small>
              </div>
            </div>
            <div className="detail-item">
              <Timer size={19} />
              <div>
                <span>Last GPS fix</span>
                <strong>{stamp(location.time)}</strong>
                <small>
                  {!valid
                    ? 'No valid GPS coordinates'
                    : location.stale
                      ? '3 hours before the sample clock · Stale'
                      : '2 minutes before the sample clock'}
                </small>
              </div>
            </div>
            <div className="detail-item">
              {scenario === 'offline' ? <WifiOff size={19} /> : <ShieldCheck size={19} />}
              <div>
                <span>Wearable status</span>
                <strong>{scenario === 'offline' ? 'Offline' : 'Connected'} · Demo</strong>
                <small>Connection does not confirm GPS freshness</small>
              </div>
            </div>
          </section>
          <section className="location-info">
            <span className="icon-tile">
              <ShieldCheck size={23} />
            </span>
            <h3>A location is a moment in time</h3>
            <p>
              {location.stale
                ? 'This fix is stale. The patient may have moved since it was recorded.'
                : !valid
                  ? 'The wearable has no valid GPS fix. No position has been assumed.'
                  : 'This is a sample location from the displayed GPS-fix time. It does not track a real person.'}
            </p>
            <p>Always check when a location was recorded.</p>
          </section>
        </aside>
      </div>
    </>
  )
}
