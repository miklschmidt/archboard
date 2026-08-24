import React from 'react'
import type { DoingEntry, LockHolder } from '../types'
import { Icon } from './Icons'

interface AgentRailProps {
  connected: boolean
  heldBy: LockHolder | null
  doing: DoingEntry[]
  takeBack?: () => void
}

const clock = (iso: string): string =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export function AgentRail({ connected, heldBy, doing, takeBack }: AgentRailProps): JSX.Element {
  const claimed = heldBy?.claimed === true
  const latest = doing.at(-1)
  const state = claimed ? 'Working' : connected ? 'Ready' : 'Offline'

  return (
    <aside className="agent-rail" aria-label="Agent activity">
      {claimed && <div className="claim-beacon" aria-hidden="true"><span>Agent claim</span></div>}

      <header className="rail-header">
        <div className="rail-title">
          <span className="agent-avatar"><Icon name="activity" size={16} /></span>
          <span>Agent activity</span>
        </div>
        <span className={`live-badge${connected ? '' : ' is-offline'}`}>
          <span className="live-dot" />{state}
        </span>
      </header>

      {claimed && (
        <section className="pane-claim claim-card" role="status">
          <div className="claim-kicker"><Icon name="check" size={16} />Agent has the board</div>
          <div className="pane-claim-what claim-title">
            <small>Current campaign</small>
            {heldBy.reason || 'Working on the board'}
          </div>
          <p className="claim-copy">
            Agent edits are serialized while this claim is active. You can return control at any time.
          </p>
          <button type="button" className="pane-claim-take take-back" onClick={takeBack}>
            Take back control
          </button>
        </section>
      )}

      <div className="activity-header">
        <h2>Recent doing</h2>
        <span>{doing.length === 0 ? 'No updates' : `Last ${doing.length}`}</span>
      </div>

      <ol className="pane-doing activity-list" role="status" aria-label="Recent agent activity">
        {[...doing].reverse().map((entry, index) => (
          <li key={`${entry.at}-${entry.by}-${index}`} className="pane-doing-line activity-line">
            <time className="pane-doing-when activity-time">{clock(entry.at)}</time>
            <span className="activity-marker" aria-hidden="true" />
            <span className="pane-doing-text activity-text">{entry.doing}</span>
          </li>
        ))}
        {doing.length === 0 && (
          <li className="activity-empty">
            Agent progress will appear here while this board is being changed.
          </li>
        )}
      </ol>

      {latest && <span className="doing-now" aria-hidden="true">{latest.doing}</span>}

      <footer className="rail-footer">
        <div className="agent-note"><Icon name="check" size={16} />Named boards write through to their vault notes automatically.</div>
      </footer>
    </aside>
  )
}
