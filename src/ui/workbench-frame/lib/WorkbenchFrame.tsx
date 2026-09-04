import {
	useCallback,
	useId,
	useLayoutEffect,
	useMemo,
	useRef,
	useSyncExternalStore,
	type FocusEvent,
	type ReactNode,
} from "react";

import { Button } from "../../button/index.js";
import { cn } from "../../ui-classnames/index.js";
import { WorkbenchApprovals } from "../../workbench-approvals/index.js";
import { WorkbenchBoardStatus } from "../../workbench-board-status/index.js";
import { WorkbenchComposer } from "../../workbench-composer/index.js";
import { WorkbenchCoordinatorDisclosure } from "../../workbench-coordinator/index.js";
import { WorkbenchQueue } from "../../workbench-queue/index.js";
import { WorkbenchRuntimeProvider } from "../../workbench-runtime/index.js";
import { WorkbenchThreadLink } from "../../workbench-thread-link/index.js";
import { WorkbenchTimeline } from "../../workbench-timeline/index.js";
import type { BrowserWorkbenchTransport } from "../../workbench-transport/index.js";
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
import { VoiceComposition, WorkbenchFrameSpokenApproval } from "./VoiceComposition.js";

function useTransportState(transport: BrowserWorkbenchTransport) {
	return useSyncExternalStore(transport.subscribe, transport.state, transport.state);
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

interface FrameHeaderProps {
	readonly titleId: string;
	readonly captureTitle: (node: HTMLParagraphElement | null) => void;
	readonly captureToggle: (node: HTMLButtonElement | null) => void;
	readonly view: WorkbenchFrameView;
	readonly disclosure: WorkbenchFrameDisclosure;
	readonly space: WorkbenchFrameProps["space"];
	readonly voiceSource: WorkbenchFrameVoiceSource | null;
	readonly voiceView: VoiceSessionView | null;
	readonly onActivePaneChange: WorkbenchFrameProps["onActivePaneChange"];
	readonly onDisclosureChange: WorkbenchFrameProps["onDisclosureChange"];
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
	onActivePaneChange,
	onDisclosureChange,
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
		<header className="flex min-h-header shrink-0 items-center gap-control border-b border-border bg-surface px-region">
			<div className="min-w-0 shrink-0">
				<p className="m-0 text-kicker font-semibold text-muted-foreground">Codex</p>
				<p
					className="m-0 font-sans text-title font-semibold outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
					data-workbench-title=""
					id={titleId}
					ref={captureTitle}
					tabIndex={-1}
				>
					Agent workbench
				</p>
			</div>
			{ready === null ? null : (
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
			)}
			{voiceSource === null || voiceView === null ? null : (
				<div
					className="min-w-0 ml-auto shrink overflow-hidden font-sans text-body"
					data-workbench-voice-source-summary=""
				>
					<span className="text-muted-foreground">Voice source </span>
					<span className="font-medium text-foreground">{voiceSource.pane.label}</span>
					{voiceSourceIssue !== null ? (
						<span className="block text-destructive" data-workbench-voice-source-mismatch="">
							Binding unavailable
						</span>
					) : voiceView.binding === null ? (
						<span className="block text-muted-foreground" data-workbench-voice-source-unbound="">
							No workhorse thread is bound before Start.
						</span>
					) : (
						<span
							className="block max-w-full truncate font-mono text-foreground"
							data-workbench-voice-source-thread=""
							title={voiceView.binding.workhorseThreadId}
						>
							{voiceView.binding.workhorseThreadId}
						</span>
					)}
				</div>
			)}
			<div className={voiceSource === null ? "ml-auto shrink-0" : "shrink-0"}>
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
	readonly timelineId: string;
	readonly coordinatorId: string;
	readonly queueId: string;
	readonly approvalsId: string;
}

function ActivePane({ pane, timelineId, coordinatorId, queueId, approvalsId }: ActivePaneProps) {
	const state = useTransportState(pane.transport);
	const crossLinks = useMemo(
		() => ({
			workhorseTimelineId: timelineId,
			coordinatorDisclosureId: coordinatorId,
			approvalsId,
		}),
		[approvalsId, coordinatorId, timelineId],
	);
	return (
		<>
			<section
				aria-label={`${pane.identity.label} workhorse`}
				className="min-h-0 min-w-0 [&>[data-workbench-runtime]]:min-h-0 col-span-2 flex flex-col overflow-hidden border-r border-border bg-surface [&>[data-workbench-runtime]]:flex [&>[data-workbench-runtime]]:flex-1 [&>[data-workbench-runtime]]:flex-col [&>[data-workbench-runtime]]:overflow-hidden"
				data-workbench-region="workhorse"
			>
				<WorkbenchRuntimeProvider
					onSubmit={pane.composerController.submit}
					transport={pane.transport}
				>
					<div className="min-h-0 min-w-0 flex flex-1 flex-col overflow-hidden">
						<div className="min-h-0 flex-1 overflow-y-auto" id={timelineId}>
							{pane.timeline === null ? (
								<output
									aria-live="polite"
									className="min-h-touch-target border-b border-border bg-surface px-region py-panel text-muted-foreground"
									data-workbench-timeline="unbound"
								>
									<span className="block font-sans text-body">
										No workhorse thread is linked to this pane. Use the pane thread-link controls to
										create or attach one.
									</span>
								</output>
							) : (
								<WorkbenchTimeline
									{...pane.timeline}
									className="h-full"
									label="Workhorse activity"
								/>
							)}
						</div>
						<WorkbenchComposer controller={pane.composerController} state={state} />
					</div>
				</WorkbenchRuntimeProvider>
			</section>
			<aside
				aria-label={`${pane.identity.label} workbench operations`}
				className="min-h-0 min-w-0 col-span-1 overflow-y-auto bg-surface-raised"
				data-workbench-region="operations"
			>
				<section aria-label="Board claim and doing" data-workbench-operation="board-status">
					<WorkbenchBoardStatus {...pane.boardStatus} paneLabel={pane.identity.label} />
				</section>
				<div id={queueId}>
					<WorkbenchQueue crossLinks={crossLinks} transport={pane.transport} />
				</div>
				<WorkbenchThreadLink
					controller={pane.threadLink.controller}
					hostRecoveryIntents={pane.threadLink.hostRecoveryIntents}
					initialAccountForm={pane.threadLink.initialAccountForm}
					paneId={pane.identity.id}
					transport={pane.transport}
				/>
				<div id={coordinatorId}>
					<WorkbenchCoordinatorDisclosure state={state} />
				</div>
			</aside>
		</>
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
	readonly sourceLabel?: string;
}

function AppGlobalRequestSurface({
	children,
	id,
	projection,
	sourceLabel,
}: AppGlobalRequestSurfaceProps) {
	return (
		<section
			aria-label="Application-wide Codex requests"
			className={APP_GLOBAL_REQUEST_BOUNDED_LAYOUT}
			data-workbench-region="app-global-request"
			data-workbench-request={projection}
			data-workbench-request-allocation="bounded-half-frame"
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
	voicePresent,
}: {
	readonly source: WorkbenchFrameRequestSource;
	readonly id: string;
	readonly voicePresent: boolean;
}) {
	const state = useTransportState(source.transport);
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
	voicePresent,
}: {
	readonly request: WorkbenchFrameRequest;
	readonly id: string;
	readonly voicePresent: boolean;
}) {
	if (request.state === "present") {
		return <PresentAppGlobalRequest id={id} source={request.source} voicePresent={voicePresent} />;
	}
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
	const contentHadFocus = useRef(false);
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
	const voiceSourceIssue =
		voice === null || voiceView === null
			? null
			: workbenchFrameVoiceSourceIssue(voice.source, voiceView);
	const voiceCrossLinkIds = useMemo<VoiceTranscriptCrossLinkIds>(
		() => ({
			delegationId: coordinatorId,
			queueId,
			steerId: timelineId,
			approvalId: approvalsId,
			callbackId: coordinatorId,
			workhorseResultId: timelineId,
		}),
		[approvalsId, coordinatorId, queueId, timelineId],
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
		>
			<FrameHeader
				captureTitle={captureTitle}
				captureToggle={captureToggle}
				disclosure={props.disclosure}
				onActivePaneChange={props.onActivePaneChange}
				onDisclosureChange={props.onDisclosureChange}
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
							<VoiceComposition
								crossLinkIds={voiceCrossLinkIds}
								sessionView={voiceView}
								voice={voice}
							/>
						)}
						{props.view.state !== "ready" ? (
							<div className="min-h-0 flex-1 overflow-y-auto">
								<FrameState view={props.view} />
							</div>
						) : issue !== null ? (
							<div className="min-h-0 flex-1 overflow-y-auto">
								<InvalidReadyState detail={issue} />
							</div>
						) : activePane !== null ? (
							<div className="min-h-0 min-w-0 grid flex-1 grid-cols-3 overflow-hidden">
								<ActivePane
									approvalsId={approvalsId}
									coordinatorId={coordinatorId}
									pane={activePane}
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
				voicePresent={voice !== null && voiceSourceIssue === null}
			/>
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
