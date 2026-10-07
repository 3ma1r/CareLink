import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useCare } from '../state'

export function EntryBrand({ large = false }: { large?: boolean }) {
  return (
    <div className={`entry-brand ${large ? 'entry-brand-large' : ''}`}>
      <img src="/assets/entry-mark.svg" alt="" aria-hidden="true" />
      <span>
        Care<span>Link</span>
      </span>
    </div>
  )
}

export function SplashScreen({ leaving }: { leaving: boolean }) {
  return (
    <div className={`entry-screen entry-splash ${leaving ? 'entry-leaving' : ''}`}>
      <main className="entry-splash-main" aria-labelledby="entry-splash-title">
        <div className="entry-orbits" aria-hidden="true">
          <span className="entry-orbit entry-orbit-one" />
          <span className="entry-orbit entry-orbit-two" />
          <span className="entry-orbit entry-orbit-three" />
          <i className="entry-orbit-point point-one" />
          <i className="entry-orbit-point point-two" />
          <i className="entry-orbit-point point-three" />
          <img src="/assets/entry-mark.svg" alt="" />
        </div>
        <h1 id="entry-splash-title">
          <span>Care</span>
          <span>Link</span>
        </h1>
        <p className="entry-tagline">CARE, CONNECTED.</p>
      </main>
      <div className="entry-splash-status" role="status" aria-live="polite">
        <div className="entry-loading-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <p>Connecting your care...</p>
      </div>
    </div>
  )
}

const slides = [
  {
    image: '/assets/entry-wearable.svg',
    alt: 'CareLink wearable connected to heart rate, oxygen level and temperature readings',
    title: (
      <>
        Stay connected <br />
        to <em>their health</em>
      </>
    ),
    description:
      'View heart rate, oxygen level and temperature readings from the CareLink wearable.',
  },
  {
    image: '/assets/entry-insights.svg',
    alt: 'Personalized pattern chart with a notification symbol',
    title: (
      <>
        Understand changes. <br />
        <em>Stay informed.</em>
      </>
    ),
    description:
      'CareLink learns the patient’s usual pattern and notifies you when important health changes need attention.',
  },
] as const

export function OnboardingScreens({ replay, onComplete }: { replay: boolean; onComplete(): void }) {
  const [step, setStep] = useState<0 | 1>(0)
  const navigate = useNavigate()
  const auth = useAuth()
  const { resolvedTheme, systemTheme } = useCare()
  const slide = slides[step]
  const entryTheme = replay ? resolvedTheme : systemTheme
  function finish() {
    if (!replay) onComplete()
    navigate(replay ? '/profile' : auth.status === 'signed-in' ? '/' : '/sign-in', {
      replace: true,
    })
  }
  return (
    <div className="entry-screen entry-onboarding" data-carelink-theme={entryTheme}>
      <div className="entry-onboarding-frame">
        <header className="entry-onboarding-header">
          <EntryBrand />
          <button type="button" className="entry-skip" onClick={finish}>
            Skip
          </button>
        </header>
        <main className="entry-onboarding-main" aria-live="polite">
          <div className="entry-illustration">
            <img src={slide.image} alt={slide.alt} />
          </div>
          <div className="entry-onboarding-copy">
            <h1>{slide.title}</h1>
            <p>{slide.description}</p>
          </div>
        </main>
        <footer className="entry-onboarding-footer">
          <div className="entry-page-dots" role="group" aria-label="Introduction progress">
            {[0, 1].map((index) => (
              <span
                key={index}
                className={step === index ? 'current' : ''}
                role="img"
                aria-label={`Page ${index + 1} of 2${step === index ? ', current' : ''}`}
              />
            ))}
          </div>
          <button
            type="button"
            className="entry-primary"
            onClick={() => (step === 0 ? setStep(1) : finish())}
          >
            {step === 0 ? 'Continue' : replay ? 'Back to profile' : 'Go to sign in'}
          </button>
          <p className="entry-step-count">{step + 1} of 2</p>
        </footer>
      </div>
    </div>
  )
}
