import {
	useCallback,
	useId,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
	type FocusEvent,
	type MouseEvent,
	type RefObject,
	type ReactNode,
} from "react";

import { Button } from "../../button/index.js";
import { cn } from "../../ui-classnames/index.js";
import { WorkbenchApprovals } from "../../workbench-approvals/index.js";
import { WorkbenchBoardStatus } from "../../workbench-board-status/index.js";
import { WorkbenchComposer } from "../../workbench-composer/index.js";
import {
	projectWorkbenchQueue,
	WorkbenchQueue,
	type WorkbenchQueueCrossLinks,
} from "../../workbench-queue/index.js";
import { WorkbenchRuntimeProvider } from "../../workbench-runtime/index.js";
import { WorkbenchTimeline } from "../../workbench-timeline/index.js";
import type {
	BrowserWorkbenchState,
	BrowserWorkbenchTransport,
} from "../../workbench-transport/index.js";
import { VoiceControls } from "../../voice-controls/index.js";
import { useVoiceSession, type VoiceSessionView } from "../../voice-session/index.js";
import type { VoiceTranscriptCrossLinkIds } from "../../voice-transcript/index.js";
import { workbenchFrameRequestSourceIssue, workbenchFrameVoiceSourceIssue } from "../contract.js";
import type {
	WorkbenchFrameDisclosure,
	WorkbenchFramePane,
	WorkbenchFramePaneIdentity,
	WorkbenchFrameProps,
	WorkbenchFrameRequest,
	WorkbenchFrameRequestSource,
	WorkbenchFrameView,
	WorkbenchFrameVoiceSlot,
	WorkbenchFrameVoiceSource,
} from "../contract.js";
import { WorkbenchFrameCompact } from "./WorkbenchFrameCompact.js";
import { WorkbenchSettingsDialog } from "./WorkbenchSettingsDialog.js";
import { VoiceComposition, WorkbenchFrameSpokenApproval } from "./VoiceComposition.js";

function useTransportState(transport: BrowserWorkbenchTransport) {
	return useSyncExternalStore(transport.subscribe, transport.state, transport.state);
}

function subscribeToAbsentRequest(): () => void {
	return () => undefined;
}

function absentRequestState(): null {
	return null;
}

function useOptionalTransportState(
	transport: BrowserWorkbenchTransport | null,
): BrowserWorkbenchState | null {
	return useSyncExternalStore(
		transport?.subscribe ?? subscribeToAbsentRequest,
		transport?.state ?? absentRequestState,
		transport?.state ?? absentRequestState,
	);
}

function useRequestState(request: WorkbenchFrameRequest): BrowserWorkbenchState | null {
	const transport = request.state === "present" ? request.source.transport : null;
	return useSyncExternalStore(
		transport?.subscribe ?? subscribeToAbsentRequest,
		transport?.state ?? absentRequestState,
		transport?.state ?? absentRequestState,
	);
}

function paneIssue(view: Extract<WorkbenchFrameView, { readonly state: "ready" }>): string | null {
	const identities = view.panes.map(({ identity }) => identity);
	if (identities.some(({ id, label }) => id.trim() === "" || label.trim() === "")) {
		return "Every workbench pane needs a non-empty identity and exact source label.";
	}
	if (new Set(identities.map(({ id }) => id)).size !== identities.length) {
		return "Workbench pane identities must be unique.";
	}
	if (!identities.some(({ id }) => id === view.activePaneId)) {
		return "The active workbench pane is no longer available.";
	}
	return null;
}

function samePaneIdentity(
	left: WorkbenchFramePaneIdentity,
	right: WorkbenchFramePaneIdentity,
): boolean {
	return left.id === right.id && left.label === right.label;
}

function FrameState({ view }: { readonly view: Exclude<WorkbenchFrameView, { state: "ready" }> }) {
	const error = view.state === "error";
	return (
		<section
			aria-label="Codex workbench availability"
			className={cn(
				"min-h-touch-target border-t border-border bg-surface px-region py-panel",
				error ? "text-destructive" : "text-muted-foreground",
			)}
			data-workbench-projection={view.state}
			role={error ? "alert" : "status"}
		>
			<p className="m-0 font-sans text-body">{view.detail}</p>
			{error ? (
				<p className="m-0 pt-control font-sans text-body text-muted-foreground">{view.recovery}</p>
			) : null}
		</section>
	);
}

function InvalidReadyState({ detail }: { readonly detail: string }) {
	return (
		<section
			aria-label="Codex workbench availability"
			className="min-h-touch-target border-t border-border bg-destructive-subtle px-region py-panel text-destructive"
			data-workbench-projection="error"
			role="alert"
		>
			<p className="m-0 font-sans text-body">{detail}</p>
			<p className="m-0 pt-control font-sans text-body text-muted-foreground">
				Select an available pane before operating the workbench.
			</p>
		</section>
	);
}

interface PaneControlProps {
	readonly pane: WorkbenchFramePaneIdentity;
	readonly active: boolean;
	readonly onSelect: WorkbenchFrameProps["onActivePaneChange"];
}

function PaneControl({ pane, active, onSelect }: PaneControlProps) {
	const select = useCallback(() => onSelect(pane.id), [onSelect, pane.id]);
	return (
		<Button
			aria-label={pane.label}
			aria-pressed={active}
			data-workbench-pane={pane.id}
			data-workbench-pane-active={active || undefined}
			onClick={select}
			tone={active ? "secondary" : "quiet"}
			type="button"
		>
			<span className="min-w-0 truncate">{pane.label}</span>
			{active ? (
				<span aria-hidden="true" className="text-status-foreground">
					Active
				</span>
			) : null}
		</Button>
	);
}

function readableState(value: string): string {
	const words = value.replaceAll("_", " ").replaceAll("-", " ");
	return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

function agentConnectionLabel(value: string): string {
	return value === "notLoaded" || value === "unbound" ? "No agent linked" : readableState(value);
}

function AgentConnection({ pane }: { readonly pane: WorkbenchFramePane }) {
	const state = useTransportState(pane.transport);
	const value =
		state.kind === "readiness" ? (state.snapshot.threadLink.status ?? state.state) : state.state;
	const label = agentConnectionLabel(value);
	return (
		<output
			aria-label={`Agent connection: ${label}`}
			aria-live="polite"
			className="min-w-0 inline-flex items-center gap-control border-l border-border pl-region font-sans text-body text-muted-foreground"
			data-workbench-connection-state={state.state}
		>
			<span
				aria-hidden="true"
				className={
					state.connection === "connected"
						? "size-status-dot rounded-round bg-status"
						: "size-status-dot rounded-round bg-offline"
				}
			/>
			<span className="truncate">{label}</span>
		</output>
	);
}

interface FrameHeaderProps {
	readonly titleId: string;
	readonly captureTitle: (node: HTMLParagraphElement | null) => void;
	readonly captureToggle: (node: HTMLButtonElement | null) => void;
	readonly view: WorkbenchFrameView;
	readonly disclosure: WorkbenchFrameDisclosure;
	readonly space: WorkbenchFrameProps["space"];
	readonly voiceSource: WorkbenchFrameVoiceSource | null;
	readonly voiceView: VoiceSessionView | null;
	readonly activePane: WorkbenchFramePane | null;
	readonly onActivePaneChange: WorkbenchFrameProps["onActivePaneChange"];
	readonly onDisclosureChange: WorkbenchFrameProps["onDisclosureChange"];
	readonly onOpenSettings: () => void;
	readonly settingsRef: RefObject<HTMLButtonElement | null>;
}

function FrameHeader({
	titleId,
	captureTitle,
	captureToggle,
	view,
	disclosure,
	space,
	voiceSource,
	voiceView,
	activePane,
	onActivePaneChange,
	onDisclosureChange,
	onOpenSettings,
	settingsRef,
}: FrameHeaderProps) {
	const toggle = useCallback(
		() => onDisclosureChange(disclosure === "expanded" ? "collapsed" : "expanded"),
		[disclosure, onDisclosureChange],
	);
	const ready = view.state === "ready" ? view : null;
	const voiceSourceIssue =
		voiceSource === null || voiceView === null
			? null
			: workbenchFrameVoiceSourceIssue(voiceSource, voiceView);
	return (
		<header className="flex min-h-header shrink-0 items-center gap-region border-b border-border bg-surface px-region">
			<div className="min-w-0 shrink-0">
				<p
					className="m-0 flex items-center gap-control font-sans text-title font-semibold outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
					data-workbench-title=""
					id={titleId}
					ref={captureTitle}
					tabIndex={-1}
				>
					<span aria-hidden="true" className="size-status-dot rounded-round bg-status" />
					Agent
				</p>
			</div>
			{ready === null ? null : ready.panes.length > 1 ? (
				<nav aria-label="Workbench panes" className="min-w-0 flex flex-1 items-center gap-control">
					{ready.panes.map((pane) => (
						<PaneControl
							active={pane.identity.id === ready.activePaneId}
							key={pane.identity.id}
							onSelect={onActivePaneChange}
							pane={pane.identity}
						/>
					))}
				</nav>
			) : (
				<span className="min-w-0 flex-1 truncate border-l border-border pl-region font-sans text-body text-muted-foreground">
					{ready.panes[0]?.identity.label}
				</span>
			)}
			{activePane === null ? null : <AgentConnection pane={activePane} />}
			{voiceSource === null || voiceView === null ? null : voiceSourceIssue !== null ? (
				<span
					className="ml-auto font-sans text-body text-destructive"
					data-workbench-voice-source-mismatch=""
					role="alert"
				>
					Voice unavailable
				</span>
			) : (
				<div className="min-w-0 ml-auto flex shrink-0 items-center gap-control">
					{activePane === null || samePaneIdentity(activePane.identity, voiceSource.pane) ? null : (
						<span
							className="font-sans text-body text-muted-foreground"
							data-workbench-voice-source-summary=""
						>
							Voice · {voiceSource.pane.label}
						</span>
					)}
					<VoiceControls session={voiceSource.session} variant="toolbar" />
				</div>
			)}
			<div
				className={
					voiceSource === null
						? "ml-auto flex shrink-0 items-center gap-control"
						: "flex shrink-0 items-center gap-control"
				}
			>
				{ready === null ? null : (
					<Button
						data-workbench-target-pane={activePane?.identity.id}
						onClick={onOpenSettings}
						ref={settingsRef}
						tone="quiet"
						type="button"
					>
						Settings
					</Button>
				)}
				{space === "workspace" ? (
					<Button onClick={toggle} ref={captureToggle} tone="quiet" type="button">
						{disclosure === "expanded" ? "Collapse" : "Expand"}
					</Button>
				) : (
					<span className="font-sans text-body text-muted-foreground">Fullscreen canvas</span>
				)}
			</div>
		</header>
	);
}

interface ActivePaneProps {
	readonly pane: WorkbenchFramePane;
	readonly state: BrowserWorkbenchState;
	readonly timelineId: string;
	readonly coordinatorId: string;
	readonly queueId: string;
	readonly approvalsId: string;
	readonly onOpenSettings: () => void;
}

function hasQueue(state: BrowserWorkbenchState): boolean {
	return (
		state.snapshot !== null &&
		(state.snapshot.threadLink.threadId !== null || state.snapshot.queue.entries.length > 0)
	);
}

function QueueDisclosure({
	state,
	pane,
	crossLinks,
	queueId,
}: {
	readonly state: BrowserWorkbenchState;
	readonly pane: WorkbenchFramePane;
	readonly crossLinks: WorkbenchQueueCrossLinks;
	readonly queueId: string;
}) {
	const queue = projectWorkbenchQueue({ state, capabilities: pane.transport.capabilities() });
	if (!hasQueue(state)) return null;
	const summary =
		queue.entries.length === 0
			? queue.add.enabled
				? "Add a request"
				: queue.label
			: `${queue.entries.length} ${queue.entries.length === 1 ? "request" : "requests"}`;
	return (
		<details
			className="group max-h-1/2 min-h-touch-target shrink-0 overflow-y-auto overscroll-contain border-t border-border bg-surface"
			data-workbench-queue-disclosure=""
			data-workbench-target-pane={pane.identity.id}
			id={queueId}
		>
			<summary className="flex min-h-touch-target cursor-pointer items-center justify-between gap-control px-region font-sans text-body outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
				<span className="font-medium">Queue</span>
				<span className="text-muted-foreground">{summary}</span>
			</summary>
			<WorkbenchQueue
				className="border-x-0 border-b-0"
				crossLinks={crossLinks}
				transport={pane.transport}
			/>
		</details>
	);
}

function ActivePane({
	pane,
	state,
	timelineId,
	coordinatorId,
	queueId,
	approvalsId,
	onOpenSettings,
}: ActivePaneProps) {
	const crossLinks = useMemo(
		() => ({
			workhorseTimelineId: timelineId,
			coordinatorDisclosureId: coordinatorId,
			approvalsId,
		}),
		[approvalsId, coordinatorId, timelineId],
	);
	return (
		<section
			aria-label={`${pane.identity.label} agent conversation`}
			className="min-h-0 min-w-0 [&>[data-workbench-runtime]]:min-h-0 [&>[data-workbench-runtime]]:min-w-0 flex h-full w-full flex-col overflow-hidden bg-surface [&>[data-workbench-runtime]]:flex [&>[data-workbench-runtime]]:w-full [&>[data-workbench-runtime]]:flex-1 [&>[data-workbench-runtime]]:flex-col [&>[data-workbench-runtime]]:overflow-hidden"
			data-workbench-region="conversation"
		>
			<WorkbenchBoardStatus {...pane.boardStatus} paneLabel={pane.identity.label} />
			{pane.timeline === null ? (
				<div
					className="min-h-0 flex flex-1 flex-col items-center justify-center gap-control px-panel py-region text-center"
					data-workbench-timeline="unbound"
				>
					<p className="m-0 font-sans text-title font-semibold">Connect an agent to this pane</p>
					<p className="m-0 max-w-prose font-sans text-body text-muted-foreground">
						Create a workhorse or attach an existing thread to start a conversation.
					</p>
					<Button onClick={onOpenSettings} tone="primary" type="button">
						Open Agent settings
					</Button>
				</div>
			) : (
				<WorkbenchRuntimeProvider
					onSubmit={pane.composerController.submit}
					transport={pane.transport}
				>
					<div className="min-h-0 min-w-0 flex flex-1 flex-col overflow-hidden">
						<div
							className="min-h-0 flex-1 overflow-y-auto"
							data-workbench-target-pane={pane.identity.id}
							id={timelineId}
						>
							<WorkbenchTimeline {...pane.timeline} className="h-full" label="Agent activity" />
						</div>
						<QueueDisclosure crossLinks={crossLinks} pane={pane} queueId={queueId} state={state} />
						<WorkbenchComposer
							className="shrink-0"
							controller={pane.composerController}
							state={state}
						/>
					</div>
				</WorkbenchRuntimeProvider>
			)}
		</section>
	);
}

function RequestState({
	request,
}: {
	readonly request: Exclude<WorkbenchFrameRequest, { state: "present" }>;
}) {
	const error = request.state === "error";
	return (
		<div
			className={cn(
				"min-h-touch-target border-t border-border-subtle px-region py-control font-sans text-body",
				error ? "bg-destructive-subtle text-destructive" : "bg-surface text-muted-foreground",
			)}
			data-workbench-request-projection={request.state}
			role={error ? "alert" : "status"}
		>
			<p className="m-0">{request.detail}</p>
			{error ? <p className="m-0 pt-compact text-muted-foreground">{request.recovery}</p> : null}
		</div>
	);
}

const INVALID_REQUEST_SOURCE = Object.freeze({
	state: "error",
	detail: "The application-wide request has no exact source pane label.",
	recovery: "Reload the workbench request from its originating pane.",
}) satisfies Exclude<WorkbenchFrameRequest, { state: "present" }>;

const APP_GLOBAL_REQUEST_BOUNDED_LAYOUT =
	"min-w-0 max-h-1/2 min-h-touch-target shrink-0 overflow-y-auto overscroll-contain border-t border-border bg-surface shadow-flat";

interface AppGlobalRequestSurfaceProps {
	readonly children: ReactNode;
	readonly id: string;
	readonly projection: WorkbenchFrameRequest["state"];
	readonly sourcePaneId?: string;
	readonly sourceLabel?: string;
}

function AppGlobalRequestSurface({
	children,
	id,
	projection,
	sourcePaneId,
	sourceLabel,
}: AppGlobalRequestSurfaceProps) {
	return (
		<section
			aria-label="Application-wide Codex requests"
			className={APP_GLOBAL_REQUEST_BOUNDED_LAYOUT}
			data-workbench-region="app-global-request"
			data-workbench-request={projection}
			data-workbench-request-allocation="bounded-half-frame"
			data-workbench-target-pane={sourcePaneId}
			id={id}
		>
			<header className="top-0 sticky z-10 flex min-h-touch-target items-center justify-between gap-control bg-surface px-region">
				<div className="min-w-0">
					<p className="m-0 text-kicker font-semibold text-muted-foreground">Application-wide</p>
					<p className="m-0 font-sans text-title font-semibold">Approval and input requests</p>
				</div>
				{sourceLabel === undefined ? null : (
					<dl className="m-0 min-w-0 flex items-baseline gap-control">
						<dt className="font-sans text-body text-muted-foreground">Source pane</dt>
						<dd className="m-0 max-w-full truncate font-sans text-body font-medium">
							{sourceLabel}
						</dd>
					</dl>
				)}
			</header>
			{children}
		</section>
	);
}

function PresentAppGlobalRequest({
	source,
	id,
	state,
	voicePresent,
}: {
	readonly source: WorkbenchFrameRequestSource;
	readonly id: string;
	readonly state: BrowserWorkbenchState;
	readonly voicePresent: boolean;
}) {
	const sourceIssue = workbenchFrameRequestSourceIssue(source, state);
	const nowMs = sourceIssue === null ? (source.now ?? Date.now)() : 0;
	const approvalNow = useCallback(() => nowMs, [nowMs]);
	const invalidRequest =
		sourceIssue === null
			? INVALID_REQUEST_SOURCE
			: Object.freeze({ ...INVALID_REQUEST_SOURCE, detail: sourceIssue });
	return (
		<AppGlobalRequestSurface
			id={id}
			projection={sourceIssue === null ? "present" : "error"}
			sourcePaneId={sourceIssue === null ? source.pane.id : undefined}
			sourceLabel={sourceIssue === null ? source.pane.label : undefined}
		>
			{sourceIssue === null ? (
				<>
					{voicePresent ? (
						<WorkbenchFrameSpokenApproval
							nowMs={nowMs}
							state={state}
							transport={source.transport}
						/>
					) : null}
					<WorkbenchApprovals now={approvalNow} state={state} transport={source.transport} />
				</>
			) : (
				<RequestState request={invalidRequest} />
			)}
		</AppGlobalRequestSurface>
	);
}

function AppGlobalRequest({
	request,
	id,
	state,
	voicePresent,
}: {
	readonly request: WorkbenchFrameRequest;
	readonly id: string;
	readonly state: BrowserWorkbenchState | null;
	readonly voicePresent: boolean;
}) {
	if (request.state === "empty") return null;
	if (request.state === "present" && state !== null) {
		return (
			<PresentAppGlobalRequest
				id={id}
				source={request.source}
				state={state}
				voicePresent={voicePresent}
			/>
		);
	}
	if (request.state === "present") return null;
	return (
		<AppGlobalRequestSurface id={id} projection={request.state}>
			<RequestState request={request} />
		</AppGlobalRequestSurface>
	);
}

function WorkbenchFrameLayout({
	props,
	voice,
	voiceView,
}: {
	readonly props: WorkbenchFrameProps;
	readonly voice: WorkbenchFrameVoiceSlot | null;
	readonly voiceView: VoiceSessionView | null;
}): ReactNode {
	const titleId = useId();
	const timelineId = useId();
	const coordinatorId = useId();
	const queueId = useId();
	const approvalsId = useId();
	const titleRef = useRef<HTMLParagraphElement | null>(null);
	const toggleRef = useRef<HTMLButtonElement | null>(null);
	const settingsRef = useRef<HTMLButtonElement | null>(null);
	const contentHadFocus = useRef(false);
	const [settingsView, setSettingsView] = useState<"connection" | "coordinator" | null>(null);
	const requestState = useRequestState(props.request);
	const contentVisible = props.disclosure === "expanded" && props.space === "workspace";
	const previousContentVisible = useRef(contentVisible);

	useLayoutEffect(() => {
		if (previousContentVisible.current && !contentVisible && contentHadFocus.current) {
			if (props.space === "workspace") toggleRef.current?.focus();
			else titleRef.current?.focus();
			contentHadFocus.current = false;
		}
		previousContentVisible.current = contentVisible;
	}, [contentVisible, props.space]);

	const onContentFocus = useCallback(() => {
		contentHadFocus.current = true;
	}, []);
	const captureTitle = useCallback((node: HTMLParagraphElement | null) => {
		titleRef.current = node;
	}, []);
	const captureToggle = useCallback((node: HTMLButtonElement | null) => {
		toggleRef.current = node;
	}, []);
	const openSettings = useCallback(() => setSettingsView("connection"), []);
	const closeSettings = useCallback(() => setSettingsView(null), []);
	const openRelatedSettings = useCallback(
		(event: MouseEvent<HTMLElement>) => {
			if (!(event.target instanceof Element)) return;
			const link = event.target.closest("a");
			if (link?.getAttribute("href") === `#${coordinatorId}`) {
				event.preventDefault();
				setSettingsView("coordinator");
			} else if (link?.getAttribute("href") === `#${queueId}`) {
				const queue = event.currentTarget.ownerDocument.getElementById(queueId);
				if (!(queue instanceof HTMLDetailsElement)) return;
				event.preventDefault();
				queue.open = true;
				queue.querySelector("summary")?.focus();
			}
		},
		[coordinatorId, queueId],
	);
	const onContentBlur = useCallback((event: FocusEvent<HTMLDivElement>) => {
		const next = event.relatedTarget;
		contentHadFocus.current = next instanceof Node && event.currentTarget.contains(next);
	}, []);

	const ready = props.view.state === "ready" ? props.view : null;
	const issue = ready === null ? null : paneIssue(ready);
	const activePane =
		ready === null || issue !== null
			? null
			: (ready.panes.find((pane) => pane.identity.id === ready.activePaneId) ?? null);
	const activePaneState = useOptionalTransportState(activePane?.transport ?? null);
	const activeQueueVisible =
		activePane?.timeline != null && activePaneState !== null && hasQueue(activePaneState);
	const voiceSourceIssue =
		voice === null || voiceView === null
			? null
			: workbenchFrameVoiceSourceIssue(voice.source, voiceView);
	const voiceOwnsMountedPane =
		voice !== null &&
		activePane !== null &&
		samePaneIdentity(activePane.identity, voice.source.pane);
	const requestSourceIssue =
		props.request.state === "present" && requestState !== null
			? workbenchFrameRequestSourceIssue(props.request.source, requestState)
			: null;
	const voiceOwnsApproval =
		voiceOwnsMountedPane &&
		props.request.state === "present" &&
		requestState !== null &&
		requestSourceIssue === null &&
		samePaneIdentity(props.request.source.pane, voice.source.pane);
	const voiceCrossLinkIds = useMemo<VoiceTranscriptCrossLinkIds>(
		() => ({
			delegationId: voiceOwnsMountedPane ? coordinatorId : null,
			queueId: voiceOwnsMountedPane && activeQueueVisible ? queueId : null,
			steerId: voiceOwnsMountedPane ? timelineId : null,
			approvalId: voiceOwnsApproval ? approvalsId : null,
			callbackId: voiceOwnsMountedPane ? coordinatorId : null,
			workhorseResultId: voiceOwnsMountedPane ? timelineId : null,
		}),
		[
			activeQueueVisible,
			approvalsId,
			coordinatorId,
			queueId,
			timelineId,
			voiceOwnsApproval,
			voiceOwnsMountedPane,
		],
	);

	return (
		<section
			aria-labelledby={titleId}
			className={cn(
				"min-h-0 min-w-0 flex h-full max-h-full flex-col overflow-hidden border-y border-border bg-background font-sans text-foreground shadow-flat transition-colors duration-control ease-control forced-color-adjust-auto forced-colors:border-current",
				props.className,
			)}
			data-pane-count={ready?.panes.length ?? 0}
			data-workbench-disclosure={props.disclosure}
			data-workbench-frame=""
			data-workbench-space={props.space}
			onClickCapture={openRelatedSettings}
		>
			<FrameHeader
				activePane={activePane}
				captureTitle={captureTitle}
				captureToggle={captureToggle}
				disclosure={props.disclosure}
				onActivePaneChange={props.onActivePaneChange}
				onDisclosureChange={props.onDisclosureChange}
				onOpenSettings={openSettings}
				settingsRef={settingsRef}
				space={props.space}
				titleId={titleId}
				view={props.view}
				voiceSource={voice?.source ?? null}
				voiceView={voiceView}
			/>
			<div className="min-h-0 min-w-0 flex-1 overflow-hidden" data-workbench-work-area="">
				{contentVisible ? (
					<div
						className="min-h-0 min-w-0 flex h-full flex-col overflow-hidden"
						data-workbench-content="expanded"
						onBlurCapture={onContentBlur}
						onFocusCapture={onContentFocus}
					>
						{voice === null || voiceView === null ? null : (
							<details
								className="group max-h-1/2 min-h-touch-target shrink-0 overflow-y-auto overscroll-contain border-b border-border bg-surface-raised"
								data-workbench-voice-disclosure=""
							>
								<summary className="flex min-h-touch-target cursor-pointer items-center justify-between gap-control px-region font-sans text-body outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
									<span className="font-medium">Voice · {voice.source.pane.label}</span>
									<span className="text-muted-foreground">Transcript and context</span>
								</summary>
								<VoiceComposition
									crossLinkIds={voiceCrossLinkIds}
									sessionView={voiceView}
									voice={voice}
								/>
							</details>
						)}
						{props.view.state !== "ready" ? (
							<div className="min-h-0 flex-1 overflow-y-auto">
								<FrameState view={props.view} />
							</div>
						) : issue !== null ? (
							<div className="min-h-0 flex-1 overflow-y-auto">
								<InvalidReadyState detail={issue} />
							</div>
						) : activePane !== null && activePaneState !== null ? (
							<div className="min-h-0 min-w-0 flex flex-1 overflow-hidden">
								<ActivePane
									approvalsId={approvalsId}
									coordinatorId={coordinatorId}
									onOpenSettings={openSettings}
									pane={activePane}
									state={activePaneState}
									queueId={queueId}
									timelineId={timelineId}
								/>
							</div>
						) : null}
					</div>
				) : props.view.state !== "ready" ? (
					<FrameState view={props.view} />
				) : issue !== null ? (
					<InvalidReadyState detail={issue} />
				) : activePane !== null ? (
					<WorkbenchFrameCompact pane={activePane} />
				) : null}
			</div>
			<AppGlobalRequest
				id={approvalsId}
				request={props.request}
				state={requestState}
				voicePresent={voiceOwnsApproval && voiceSourceIssue === null}
			/>
			{ready !== null && issue === null ? (
				<WorkbenchSettingsDialog
					open={settingsView !== null}
					coordinatorId={coordinatorId}
					showCoordinator={settingsView === "coordinator"}
					activePaneId={ready.activePaneId}
					onActivePaneChange={props.onActivePaneChange}
					onClose={closeSettings}
					panes={ready.panes}
					returnFocusRef={settingsRef}
				/>
			) : null}
		</section>
	);
}

function VoiceSubscribedWorkbenchFrame({
	props,
	voice,
}: {
	readonly props: WorkbenchFrameProps;
	readonly voice: WorkbenchFrameVoiceSlot;
}): ReactNode {
	const voiceView = useVoiceSession(voice.source.session);
	const activeVoice = voiceView.status === "stopped" ? null : voice;
	return (
		<WorkbenchFrameLayout
			props={props}
			voice={activeVoice}
			voiceView={activeVoice === null ? null : voiceView}
		/>
	);
}

export function WorkbenchFrame(props: WorkbenchFrameProps): ReactNode {
	const voice = props.voice ?? null;
	return voice === null ? (
		<WorkbenchFrameLayout props={props} voice={null} voiceView={null} />
	) : (
		<VoiceSubscribedWorkbenchFrame props={props} voice={voice} />
	);
}
