// The dock's side panel: the voice controls beside the output wave, then the
// dense disclosures for queue, approvals, context and transcript as tabs.

import type { BrowserSnapshot } from "@/shared/codex-browser-model";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/components/tabs";
import { VoiceControls } from "@/ui/voice-controls";
import { VoiceOutputWave } from "@/ui/voice-wave";
import type { WorkbenchActions, WorkbenchView } from "@/ui/workbench/contracts";
import { ApprovalsPanel } from "@/ui/workbench/lib/approvals-panel";
import { QueuePanel } from "@/ui/workbench/lib/queue-panel";
import { TranscriptPanel } from "@/ui/workbench/lib/transcript-panel";
import { VoiceContextPanel } from "@/ui/workbench/lib/voice-context-panel";

/** Inputs for the side panel. */
interface SidePanelProps {
	snapshot: BrowserSnapshot;
	view: WorkbenchView;
	actions: WorkbenchActions;
}

/**
 * How many approvals still wait for a decision.
 * @param snapshot The published snapshot.
 * @returns The count across both approval families.
 */
function pendingApprovalCount(snapshot: BrowserSnapshot): number {
	const pending = snapshot.approvals.filter(
		(approval) => approval.lifecycle.state === "pending" || approval.lifecycle.state === "staged",
	).length;
	const dynamic = snapshot.dynamicApprovals.filter(
		(approval) => approval.state === "pending",
	).length;
	return pending + dynamic;
}

/**
 * A tab label with its count.
 * @param label The words.
 * @param count The count, shown when above zero.
 * @returns The label text.
 */
function tabLabel(label: string, count: number): string {
	return count === 0 ? label : `${label} ${count}`;
}

/**
 * The side panel.
 * @param props The snapshot, the view, and the actions.
 * @returns The voice row and the tabs.
 */
function SidePanel(props: SidePanelProps): React.JSX.Element {
	const { snapshot, view, actions } = props;
	const voiceLive = view.voice.controls.sessionState === "active";
	return (
		<aside
			aria-label="Workbench panels"
			className="border-border flex w-[24rem] shrink-0 flex-col border-l"
		>
			<div className="border-border flex items-center gap-2 border-b px-3 py-1.5">
				<VoiceOutputWave
					state={view.voice.wave.state}
					level={view.voice.wave.level}
					active={voiceLive || view.voice.controls.sessionState === "recovering"}
					reducedMotion={view.reducedMotion}
					size="icon"
				/>
				<VoiceControls
					view={view.voice.controls}
					actions={actions.voice}
					className="min-w-0 flex-1"
				/>
			</div>
			<Tabs defaultValue="queue" className="min-h-0 flex-1 gap-0 px-3 py-2">
				<TabsList variant="line" className="w-full">
					<TabsTrigger value="queue">
						{tabLabel("Queue", snapshot.queue.entries.length)}
					</TabsTrigger>
					<TabsTrigger value="approvals">
						{tabLabel("Approvals", pendingApprovalCount(snapshot))}
					</TabsTrigger>
					<TabsTrigger value="context">Context</TabsTrigger>
					<TabsTrigger value="transcript">
						{tabLabel("Transcript", snapshot.voice.transcript.length)}
					</TabsTrigger>
				</TabsList>
				<TabsContent value="queue" className="min-h-0 overflow-y-auto pt-2">
					<QueuePanel queue={snapshot.queue} command={view.queueCommand} actions={actions.queue} />
				</TabsContent>
				<TabsContent value="approvals" className="min-h-0 overflow-y-auto pt-2">
					<ApprovalsPanel
						snapshot={snapshot}
						busyApprovals={view.busyApprovals}
						errors={view.approvalErrors}
						actions={actions}
					/>
				</TabsContent>
				<TabsContent value="context" className="min-h-0 overflow-y-auto pt-2">
					<VoiceContextPanel
						voiceContext={snapshot.voiceContext ?? null}
						nowMs={view.nowMs}
						onCopy={actions.copyVoiceContext}
					/>
				</TabsContent>
				<TabsContent value="transcript" className="min-h-0 overflow-y-auto pt-2">
					<TranscriptPanel voice={snapshot.voice} />
				</TabsContent>
			</Tabs>
		</aside>
	);
}

export { SidePanel, type SidePanelProps };
