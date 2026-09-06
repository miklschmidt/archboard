// The dock's right column: the voice row (output wave, state and controls)
// over the dense panels for queue, approvals, context and transcript as flat
// underlined tabs.

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

/** Inputs for one tab label. */
interface TabLabelProps {
	label: string;
	count: number;
}

/** The scrolling panel body under the tabs. */
const PANEL_CLASS = "min-h-0 overflow-y-auto px-3 py-2";

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
 * A kicker tab label with its count in mono, shown when above zero.
 * @param props The words and the count.
 * @returns The label.
 */
function TabLabel(props: TabLabelProps): React.JSX.Element {
	return (
		<span className="text-kicker flex items-center gap-1.5 uppercase">
			{props.label}
			{props.count === 0 ? null : (
				<span className="text-technical font-mono font-medium normal-case">{props.count}</span>
			)}
		</span>
	);
}

/**
 * The side panel.
 * @param props The snapshot, the view, and the actions.
 * @returns The voice row and the tabs.
 */
function SidePanel(props: SidePanelProps): React.JSX.Element {
	const { snapshot, view, actions } = props;
	const voiceLive =
		view.voice.controls.sessionState === "active" ||
		view.voice.controls.sessionState === "recovering";
	return (
		<aside
			aria-label="Workbench panels"
			className="border-border bg-card flex w-[320px] shrink-0 flex-col border-l"
		>
			<div className="border-border flex h-8 shrink-0 items-center gap-2 border-b px-3">
				<VoiceOutputWave
					state={view.voice.wave.state}
					level={view.voice.wave.level}
					active={voiceLive}
					reducedMotion={view.reducedMotion}
					size="icon"
				/>
				<VoiceControls
					view={view.voice.controls}
					actions={actions.voice}
					className="min-w-0 flex-1"
				/>
			</div>
			<Tabs defaultValue="queue" className="min-h-0 flex-1 gap-0">
				<TabsList variant="underline" className="shrink-0 px-1">
					<TabsTrigger value="queue">
						<TabLabel label="Queue" count={snapshot.queue.entries.length} />
					</TabsTrigger>
					<TabsTrigger value="approvals">
						<TabLabel label="Approvals" count={pendingApprovalCount(snapshot)} />
					</TabsTrigger>
					<TabsTrigger value="context">
						<TabLabel label="Context" count={0} />
					</TabsTrigger>
					<TabsTrigger value="transcript">
						<TabLabel label="Transcript" count={snapshot.voice.transcript.length} />
					</TabsTrigger>
				</TabsList>
				<TabsContent value="queue" className={PANEL_CLASS}>
					<QueuePanel queue={snapshot.queue} command={view.queueCommand} actions={actions.queue} />
				</TabsContent>
				<TabsContent value="approvals" className={PANEL_CLASS}>
					<ApprovalsPanel
						snapshot={snapshot}
						busyApprovals={view.busyApprovals}
						errors={view.approvalErrors}
						actions={actions}
					/>
				</TabsContent>
				<TabsContent value="context" className={PANEL_CLASS}>
					<VoiceContextPanel
						voiceContext={snapshot.voiceContext ?? null}
						nowMs={view.nowMs}
						onCopy={actions.copyVoiceContext}
					/>
				</TabsContent>
				<TabsContent value="transcript" className={PANEL_CLASS}>
					<TranscriptPanel voice={snapshot.voice} />
				</TabsContent>
			</Tabs>
		</aside>
	);
}

export { SidePanel, type SidePanelProps };
