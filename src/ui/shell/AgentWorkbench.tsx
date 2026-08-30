import React, { useCallback, useId, useState } from "react";
import type { DoingEntry, LockHolder } from "../types";
import { Icon } from "./Icons";

interface AgentWorkbenchProps {
	paneLabel: string;
	connected: boolean;
	heldBy: LockHolder | null;
	doing: DoingEntry[];
	takeBack?: () => void;
}

const clock = (iso: string): string =>
	new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function AgentWorkbench({
	paneLabel,
	connected,
	heldBy,
	doing,
	takeBack,
}: AgentWorkbenchProps): React.JSX.Element {
	const [expanded, setExpanded] = useState(false);
	const contentId = useId();
	const claimed = heldBy?.claimed === true;
	const latest = doing.at(-1);
	const state = !connected ? "Offline" : claimed ? "Working" : "Ready";
	const toggleExpanded = useCallback(() => setExpanded((current) => !current), []);

	return (
		<section
			className="agent-workbench agent-rail"
			aria-label="Agent workbench"
			data-expanded={expanded}
			data-state={state.toLowerCase()}
		>
			<header className="workbench-summary">
				<button
					type="button"
					className="workbench-toggle"
					aria-expanded={expanded}
					aria-controls={contentId}
					onClick={toggleExpanded}
				>
					<Icon name="chevron" size={16} className="workbench-chevron" />
					<span className="agent-avatar">
						<Icon name="activity" size={15} />
					</span>
					<span>Agent workbench</span>
				</button>

				<output className="workbench-overview" aria-live="polite" aria-atomic="true">
					<span className="workbench-pane">
						<small>Focused</small>
						{paneLabel}
					</span>
					<span className={`live-badge${connected ? "" : " is-offline"}`}>
						<small>Status</small>
						<span>
							<span className="live-dot" aria-hidden="true" />
							{state}
						</span>
					</span>
					{claimed && (
						<span className="workbench-claim-summary">
							<span className="claim-beacon" aria-hidden="true">
								<span>Agent claim</span>
							</span>
							<small>Active claim</small>
							<span>{heldBy.reason || "Working on the board"}</span>
						</span>
					)}
					{latest && (
						<span className="workbench-latest">
							<small>Latest</small>
							<span className="doing-now">{latest.doing}</span>
						</span>
					)}
				</output>
			</header>

			<div className="workbench-body" id={contentId} hidden={!expanded}>
				<section className={`workbench-claim${claimed ? " is-claimed" : ""}`}>
					<div className="workbench-section-title">Claim</div>
					{claimed ? (
						<div className="pane-claim claim-card">
							<div className="claim-kicker">
								<Icon name="check" size={15} />
								Agent has the board
							</div>
							<div className="pane-claim-what claim-title">
								<small>Active claim</small>
								{heldBy.reason || "Working on the board"}
							</div>
							<p className="claim-copy">
								Agent edits are serialized while this claim is active. You can return control at any
								time.
							</p>
							<button type="button" className="pane-claim-take take-back" onClick={takeBack}>
								Take back control
							</button>
						</div>
					) : (
						<p className="workbench-empty">No active claim. The board is yours to edit.</p>
					)}
				</section>

				<section className="workbench-current">
					<div className="workbench-section-title">Latest update</div>
					{latest ? (
						<>
							<strong>{latest.doing}</strong>
							<time dateTime={latest.at}>{clock(latest.at)}</time>
						</>
					) : (
						<p className="workbench-empty">No progress has been reported for this board.</p>
					)}
				</section>

				<section className="workbench-history">
					<div className="activity-header">
						<h2>Recent doing</h2>
						<span>{doing.length === 0 ? "No updates" : `Last ${doing.length}`}</span>
					</div>
					<ol className="pane-doing activity-list" aria-label="Recent agent activity">
						{[...doing].toReversed().map((entry) => (
							<li
								key={`${entry.at}-${entry.by}-${entry.doing}`}
								className="pane-doing-line activity-line"
							>
								<time className="pane-doing-when activity-time" dateTime={entry.at}>
									{clock(entry.at)}
								</time>
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
				</section>
			</div>
		</section>
	);
}
