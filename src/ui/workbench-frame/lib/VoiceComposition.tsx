import { useSyncExternalStore, type ReactNode } from "react";

import { VoiceContextPanel } from "../../voice-context/index.js";
import type { VoiceSessionView } from "../../voice-session/index.js";
import { VoiceSpokenApproval } from "../../voice-spoken-approval/index.js";
import { VoiceTranscript, type VoiceTranscriptCrossLinkIds } from "../../voice-transcript/index.js";
import {
	projectWorkbenchApprovals,
	workbenchApprovalsInput,
	type WorkbenchOrdinaryApprovalCard,
} from "../../workbench-approvals/index.js";
import type {
	BrowserWorkbenchState,
	BrowserWorkbenchTransport,
} from "../../workbench-transport/index.js";
import { workbenchFrameVoiceSourceIssue, type WorkbenchFrameVoiceSlot } from "../contract.js";

export function VoiceComposition({
	crossLinkIds,
	sessionView,
	voice,
}: {
	readonly crossLinkIds: VoiceTranscriptCrossLinkIds;
	readonly sessionView: VoiceSessionView;
	readonly voice: WorkbenchFrameVoiceSlot;
}): ReactNode {
	const sourceIssue = workbenchFrameVoiceSourceIssue(voice.source, sessionView);
	const history = useSyncExternalStore(
		voice.context.history.subscribe,
		voice.context.history.snapshot,
		voice.context.history.snapshot,
	);
	const hasTranscript = voice.transcript.records.length > 0;
	const hasContext = history.sessions.length > 0;

	if (sourceIssue !== null) {
		return (
			<section
				aria-label="Live voice availability"
				className="min-h-touch-target border-b border-border bg-destructive-subtle px-region py-panel text-destructive"
				data-workbench-voice="error"
				role="alert"
			>
				<p className="m-0 font-sans text-body">{sourceIssue}</p>
			</section>
		);
	}
	if (!hasTranscript && !hasContext) return null;

	return (
		<section
			aria-label={`${voice.source.pane.label} live voice`}
			className="group max-h-1/2 min-h-touch-target shrink-0 overflow-y-auto overscroll-contain border-b border-border bg-surface"
			data-workbench-region="voice"
			data-workbench-voice="present"
			data-workbench-voice-source-pane={voice.source.pane.id}
		>
			<details data-workbench-voice-disclosure="">
				<summary className="flex min-h-touch-target cursor-pointer items-center justify-between gap-control px-region font-sans text-body outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
					<span className="font-medium">Voice · {voice.source.pane.label}</span>
					<span className="text-muted-foreground">
						{hasTranscript ? "Transcript" : "Shared context"}
					</span>
				</summary>
				<div className="min-h-0 border-t border-border">
					{hasTranscript ? (
						<div className="min-h-0 min-w-0 overflow-y-auto">
							<VoiceTranscript
								{...voice.transcript}
								announcementOwner="external"
								className="min-h-full border-y-0"
								crossLinkIds={crossLinkIds}
								session={sessionView}
							/>
						</div>
					) : null}
					{hasContext ? (
						<details className="min-h-0 min-w-0 border-t border-border">
							<summary className="flex min-h-touch-target cursor-pointer items-center px-region font-sans text-body text-muted-foreground outline-none focus-visible:outline-2 focus-visible:outline-ring">
								Shared board context
							</summary>
							<VoiceContextPanel {...voice.context} className="min-h-full border-y-0" />
						</details>
					) : null}
				</div>
			</details>
		</section>
	);
}

function matchingOrdinaryApproval(
	state: BrowserWorkbenchState,
	transport: BrowserWorkbenchTransport,
	nowMs: number,
): WorkbenchOrdinaryApprovalCard | null {
	const spokenApproval = state.snapshot?.spokenApproval ?? null;
	const requestId = spokenApproval?.approval?.requestId ?? null;
	if (spokenApproval === null || spokenApproval.state === "idle" || requestId === null) return null;
	const view = projectWorkbenchApprovals(
		workbenchApprovalsInput(state, nowMs, transport.capabilities()),
	);
	return (
		view.cards.find(
			(card): card is WorkbenchOrdinaryApprovalCard =>
				card.kind === "ordinary" && card.request.requestId === requestId,
		) ?? null
	);
}

export function WorkbenchFrameSpokenApproval({
	state,
	transport,
	nowMs,
}: {
	readonly state: BrowserWorkbenchState;
	readonly transport: BrowserWorkbenchTransport;
	readonly nowMs: number;
}): ReactNode {
	const card = matchingOrdinaryApproval(state, transport, nowMs);
	const spokenApproval = state.snapshot?.spokenApproval ?? null;
	if (card === null || spokenApproval === null) return null;
	return <VoiceSpokenApproval card={card} spokenApproval={spokenApproval} />;
}
