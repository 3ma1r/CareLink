import { Sparkles } from 'lucide-react'
import { useCare } from '../state'
import type { AIState } from '../data/demo'
import { Badge } from './UI'
const states: Record<AIState, { title: string; text: string }> = {
  awaiting: {
    title: 'Awaiting analysis',
    text: 'AI not connected. Insights will appear here when the analysis service is available.',
  },
  learning: {
    title: 'Learning baseline',
    text: 'A future service would learn the patient’s usual patterns over time.',
  },
  usual: {
    title: 'Usual pattern',
    text: 'Example of a pattern within a learned baseline. This is not an assessment of health.',
  },
  unusual: {
    title: 'Unusual pattern',
    text: 'Example of a pattern outside a learned baseline. A caregiver would review the underlying readings.',
  },
  insufficient: {
    title: 'Insufficient data',
    text: 'Example of too few valid measurements to describe a pattern.',
  },
  unavailable: {
    title: 'Service unavailable',
    text: 'Example of an analysis service that cannot currently be reached.',
  },
}
export function AIInsights() {
  const { aiState } = useCare()
  const state = states[aiState]
  return (
    <section className="ai-card">
      <div className="section-title">
        <h2>
          <Sparkles size={21} />
          AI insights
        </h2>
        <Badge tone="muted">{aiState === 'awaiting' ? 'Coming later' : 'Demo preview'}</Badge>
      </div>
      <div className="ai-orbit">
        <Sparkles size={29} />
        <i />
        <i />
      </div>
      <h3>{state.title}</h3>
      <p>{state.text}</p>
      <div className="ai-footnote">
        <span className="status-dot" />
        {aiState === 'awaiting'
          ? 'Awaiting analysis — AI not connected'
          : 'Demo only — no AI analysis performed'}
      </div>
    </section>
  )
}
