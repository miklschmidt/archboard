import React, { useCallback, useId, useState } from "react";

import { Icon } from "../../shell/Icons";
import type {
	WorkbenchBoardStatusProps,
	WorkbenchBoardStatusSnapshot,
	WorkbenchSemanticContextState,
} from "./contract";
import { projectWorkbenchBoardStatus } from "./projection";

const DEFAULT_SEMANTIC_CONTEXT = Object.freeze({
	state: "unavailable",
}) satisfies WorkbenchSemanticContextState;

const SEMANTIC_TONE_CLASSES = {
	unavailable: "text-muted-foreground",
	fresh: "text-status-foreground",
	stale: "text-warning",
	ambiguous: "text-warning",
	refused: "text-destructive",
	outcome_unknown: "text-warning",
} as const satisfies Record<WorkbenchSemanticContextState["state"], string>;

function clock(iso: string): string {
	return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function TakeBackOutcome({ snapshot }: { snapshot: WorkbenchBoardStatusSnapshot }) {
	const announcement = snapshot.takeBack.announcement;
	if (!announcement) return null;
	return (
		<p
			className={
				snapshot.takeBack.state === "failure"
					? "take-back-outcome mt-grid-tight font-sans text-body text-destructive"
					: "take-back-outcome mt-grid-tight font-sans text-body text-muted-foreground"
			}
			role={snapshot.takeBack.state === "failure" ? "alert" : "status"}
		>
			{announcement}
		</p>
	);
}

function SemanticAnnouncement({ snapshot }: { snapshot: WorkbenchBoardStatusSnapshot }) {
	const semantic = snapshot.semanticContext;
	const failure = semantic.state === "refused";
	const announcement = `Semantic context ${semantic.label} ${semantic.description}`;
	return (
		<output
			className="workbench-semantic-announcer sr-only"
			data-semantic-announcer=""
			data-semantic-state={semantic.state}
			role={failure ? "alert" : "status"}
			aria-live={failure ? "assertive" : "polite"}
			aria-atomic="true"
			aria-label={announcement}
		>
			{announcement}
		</output>
	);
}

function SemanticDetail({ snapshot }: { snapshot: WorkbenchBoardStatusSnapshot }) {
	const semantic = snapshot.semanticContext;
	return (
		<div
			className="workbench-semantic mt-auto border-t border-border-subtle pt-control font-sans text-body"
			data-semantic-detail=""
			data-semantic-state={semantic.state}
		>
			<span className="min-w-0 flex items-baseline gap-control">
				<span className="text-kicker font-semibold text-muted-foreground">Semantic context</span>
				<span className={SEMANTIC_TONE_CLASSES[semantic.state]}>{semantic.label}</span>
			</span>
			<span className="line-clamp-1 block text-muted-foreground" title={semantic.description}>
				{semantic.description}
			</span>
		</div>
	);
}

export function WorkbenchBoardStatus({
	paneLabel,
	connection,
	claim,
	doing,
	semanticContext = DEFAULT_SEMANTIC_CONTEXT,
	onTakeBack,
	takeBackState,
}: WorkbenchBoardStatusProps): React.JSX.Element {
	const [expanded, setExpanded] = useState(false);
	const contentId = useId();
	const claimed = claim.state === "claimed";
	const effectiveTakeBack = takeBackState ?? (claimed ? "available" : "idle");
	const snapshot = projectWorkbenchBoardStatus({
		paneLabel,
		connection,
		claim,
		doing,
		takeBack: effectiveTakeBack,
		semanticContext,
	});
	const latest = snapshot.doing.current;

	const toggleExpanded = useCallback(() => setExpanded((current) => !current), []);
	const takeBack = useCallback(async () => {
		if (!onTakeBack || effectiveTakeBack === "pending") return;
		await onTakeBack();
	}, [effectiveTakeBack, onTakeBack]);
	const handleTakeBack = useCallback((): void => {
		void takeBack();
	}, [takeBack]);

	const actionDisabled =
		!onTakeBack || effectiveTakeBack === "pending" || effectiveTakeBack === "success";
	const actionLabel =
		effectiveTakeBack === "failure" ? "Try Take back control again" : snapshot.takeBack.label;

	return (
		<section
			className="agent-workbench agent-rail"
			aria-label="Agent workbench board status"
			data-connection={snapshot.connection.state}
			data-expanded={expanded}
			data-semantic={snapshot.semanticContext.state}
			data-state={snapshot.legacyState}
			data-take-back={snapshot.takeBack.state}
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
					<Icon name="activity" size={15} className="workbench-agent-icon" />
					<span>Agent workbench</span>
				</button>

				<output className="workbench-overview" aria-live="polite" aria-atomic="true">
					<span className={`live-badge${connection === "connected" ? "" : " is-offline"}`}>
						<small>Board</small>
						<span>
							<span className="live-dot" aria-hidden="true" />
							{snapshot.connection.label}
						</span>
					</span>
					<span className="workbench-claim-summary">
						{claimed && (
							<span className="claim-beacon" aria-hidden="true">
								<span>Agent claim</span>
							</span>
						)}
						<small>Claim</small>
						<span>{claimed ? claim.reason || "Working on the board" : "Board is yours"}</span>
					</span>
					{latest && (
						<span className="workbench-latest">
							<small>Current</small>
							<span className="doing-now">{latest.doing}</span>
						</span>
					)}
					<span className="workbench-pane">
						<small>Focused</small>
						<span>{paneLabel}</span>
					</span>
				</output>
			</header>
			<SemanticAnnouncement snapshot={snapshot} />

			<div className="workbench-body" id={contentId} hidden={!expanded}>
				<section className="workbench-history">
					<div className="activity-header">
						<h2>Recent doing</h2>
						<span>
							{snapshot.doing.history.length === 0
								? "No updates"
								: `Last ${snapshot.doing.history.length}`}
						</span>
					</div>
					<ol className="pane-doing activity-list" aria-label="Recent agent activity">
						{snapshot.doing.history.toReversed().map((entry) => (
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
						{snapshot.doing.history.length === 0 && (
							<li className="activity-empty">
								Agent progress will appear here while this board is being changed.
							</li>
						)}
					</ol>
				</section>

				<div className="workbench-focus">
					<section className="workbench-current">
						<div className="workbench-section-title">Current action</div>
						{latest ? (
							<>
								<strong>{latest.doing}</strong>
								<time dateTime={latest.at}>{clock(latest.at)}</time>
							</>
						) : (
							<p className="workbench-empty">No progress has been reported for this board.</p>
						)}
						<SemanticDetail snapshot={snapshot} />
					</section>

					<section className={`workbench-claim${claimed ? " is-claimed" : ""}`}>
						<div className="claim-heading">
							<div className="workbench-section-title">Claim</div>
							{claimed && (
								<div className="claim-kicker">
									<Icon name="check" size={15} />
									Agent has the board
								</div>
							)}
						</div>
						{claimed ? (
							<div className="pane-claim claim-card">
								<div className="pane-claim-what claim-title">
									<small>Active claim</small>
									{claim.reason || "Working on the board"}
								</div>
								<p className="claim-copy">
									Agent edits are serialized while this claim is active. You can return control at
									any time.
								</p>
								<button
									type="button"
									className="pane-claim-take take-back"
									disabled={actionDisabled}
									onClick={handleTakeBack}
								>
									{actionLabel}
								</button>
								<TakeBackOutcome snapshot={snapshot} />
							</div>
						) : (
							<>
								<p className="workbench-empty">No active claim. The board is yours to edit.</p>
								<TakeBackOutcome snapshot={snapshot} />
							</>
						)}
					</section>
				</div>
			</div>
		</section>
	);
}
