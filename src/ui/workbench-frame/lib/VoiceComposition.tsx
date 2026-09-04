import type { ReactNode } from "react";

import { VoiceContextPanel } from "../../voice-context/index.js";
import { VoiceControls } from "../../voice-controls/index.js";
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
	const session = voice.source.session;
	const sourceIssue = workbenchFrameVoiceSourceIssue(voice.source, sessionView);

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

	return (
		<section
			aria-label={`${voice.source.pane.label} live voice`}
			className="max-h-1/2 min-h-touch-target shrink-0 overflow-hidden border-b border-border bg-surface-raised"
			data-workbench-region="voice"
			data-workbench-voice="present"
			data-workbench-voice-source-pane={voice.source.pane.id}
		>
			<div className="min-h-0 grid h-full grid-cols-3">
				<div className="min-h-0 min-w-0 overflow-y-auto border-r border-border bg-surface">
					<header className="flex min-h-touch-target items-center gap-control border-b border-border px-region">
						<div className="min-w-0">
							<p className="m-0 text-kicker font-semibold text-muted-foreground">Voice source</p>
							<p
								className="m-0 truncate font-sans text-title font-semibold text-foreground"
								data-workbench-voice-source-label=""
							>
								{voice.source.pane.label}
							</p>
							{sessionView.binding === null ? (
								<p
									className="m-0 font-sans text-body text-muted-foreground"
									data-workbench-voice-source-unbound=""
								>
									No workhorse thread is bound before Start.
								</p>
							) : (
								<p
									className="m-0 truncate font-mono text-body text-foreground"
									data-workbench-voice-source-thread=""
									title={sessionView.binding.workhorseThreadId}
								>
									{sessionView.binding.workhorseThreadId}
								</p>
							)}
						</div>
					</header>
					<VoiceControls className="px-region py-control" session={session} />
				</div>
				<div className="min-h-0 min-w-0 overflow-y-auto border-r border-border">
					<VoiceTranscript
						{...voice.transcript}
						announcementOwner="external"
						className="min-h-full border-y-0"
						crossLinkIds={crossLinkIds}
						session={sessionView}
					/>
				</div>
				<div className="min-h-0 min-w-0 overflow-y-auto">
					<VoiceContextPanel {...voice.context} className="min-h-full border-y-0" />
				</div>
			</div>
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
