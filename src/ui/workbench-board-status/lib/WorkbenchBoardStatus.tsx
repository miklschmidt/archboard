import React, { useCallback } from "react";

import { Button } from "../../button/index.js";
import type {
	WorkbenchBoardStatusProps,
	WorkbenchBoardStatusSnapshot,
	WorkbenchSemanticContextState,
} from "./contract.js";
import { projectWorkbenchBoardStatus } from "./projection.js";

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

function TakeBackOutcome({ snapshot }: { readonly snapshot: WorkbenchBoardStatusSnapshot }) {
	const announcement = snapshot.takeBack.announcement;
	if (!announcement) return null;
	return (
		<p
			className={
				snapshot.takeBack.state === "failure"
					? "m-0 min-w-0 basis-1/3 text-body text-destructive"
					: "m-0 min-w-0 basis-1/3 text-body text-muted-foreground"
			}
			role={snapshot.takeBack.state === "failure" ? "alert" : "status"}
			data-take-back-outcome={snapshot.takeBack.state}
		>
			{announcement}
		</p>
	);
}

function SemanticAnnouncement({ snapshot }: { readonly snapshot: WorkbenchBoardStatusSnapshot }) {
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

export function WorkbenchBoardStatus({
	paneLabel,
	connection,
	claim,
	doing,
	semanticContext = DEFAULT_SEMANTIC_CONTEXT,
	onTakeBack,
	takeBackState,
}: WorkbenchBoardStatusProps): React.JSX.Element {
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
	const contextNeedsAttention = !["unavailable", "fresh"].includes(snapshot.semanticContext.state);

	return (
		<section
			aria-label={`${paneLabel} board activity`}
			className="agent-status-strip min-w-0 border-b border-border bg-surface-raised px-region font-sans text-foreground"
			data-connection={snapshot.connection.state}
			data-semantic={snapshot.semanticContext.state}
			data-state={snapshot.legacyState}
			data-take-back={snapshot.takeBack.state}
		>
			<SemanticAnnouncement snapshot={snapshot} />
			<div className="min-w-0 flex min-h-touch-target items-center gap-region">
				<output
					aria-atomic="true"
					aria-live="polite"
					className="min-w-0 flex flex-1 items-center gap-region overflow-hidden"
				>
					<span className="inline-flex shrink-0 items-center gap-control text-body font-medium">
						<span
							aria-hidden="true"
							className={
								connection === "connected"
									? "size-status-dot animate-status rounded-round bg-status"
									: "size-status-dot rounded-round bg-offline"
							}
						/>
						{claimed ? "Agent working" : snapshot.connection.label}
					</span>
					<span aria-hidden="true" className="h-4 w-rule shrink-0 bg-border" />
					<span
						aria-label={`Current agent action: ${latest?.doing ?? "No current board change"}`}
						className="min-w-0 flex-1 truncate text-body"
						data-agent-current=""
						title={latest?.doing}
					>
						<span className="mr-control text-muted-foreground">Current</span>
						<strong className="font-medium">{latest?.doing ?? "No current board change"}</strong>
					</span>
					{claimed ? (
						<span
							aria-label={`Active board claim: ${claim.reason ?? "Working on the board"}`}
							className="min-w-0 basis-1/3 truncate border-l border-border pl-region text-body text-muted-foreground"
							data-agent-claim=""
							title={claim.reason ?? claim.holderId}
						>
							<span className="mr-control text-kicker font-semibold">Claim</span>
							{claim.reason ?? "Working on the board"}
						</span>
					) : null}
					{contextNeedsAttention ? (
						<span
							className={`min-w-0 basis-1/4 truncate text-body ${SEMANTIC_TONE_CLASSES[snapshot.semanticContext.state]}`}
							title={snapshot.semanticContext.description}
						>
							Context {snapshot.semanticContext.label.toLowerCase()}:{" "}
							{snapshot.semanticContext.description}
						</span>
					) : null}
				</output>
				<TakeBackOutcome snapshot={snapshot} />
				{claimed ? (
					<Button
						className="pane-claim-take take-back shrink-0"
						disabled={actionDisabled}
						onClick={handleTakeBack}
						tone="secondary"
						type="button"
					>
						{actionLabel}
					</Button>
				) : null}
			</div>
		</section>
	);
}
