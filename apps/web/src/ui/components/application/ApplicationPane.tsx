import { usePublishedNarration } from "#ui/hooks/application/use-published-narration.ts";
import {
	useCallback,
	useEffect,
	useMemo,
	useState,
	type ComponentProps,
	type JSX,
	type ReactNode,
} from "react";

import { useQueryClient } from "@tanstack/react-query";
import { RecordedModelStage } from "#ui/components/walkthrough-recording/RecordedModelStage.tsx";
import type { Model } from "#ui/rules/architecture-model/projection.ts";
import { ModelExplanationHost } from "#ui/components/architecture-model/ModelExplanationHost.tsx";
import { explanationKey } from "#ui/clients/architecture-model/explanations.ts";
import { tabSessionId } from "#ui/clients/pane-session/tab-session.ts";
import type { PaneReading } from "#ui/state/pane-session/pane-reading.ts";
import { useVaultPolicyRefresh } from "#ui/hooks/vault-diagnostics/use-vault-check.ts";

import type { PaneCallbacks } from "#ui/hooks/application/use-panes.ts";
import type { PaneHandles } from "#ui/state/application/pane-handles.ts";
import { NOTHING_READ } from "#ui/state/pane-session/pane-reading.ts";
import { usePaneSession } from "#ui/hooks/pane-session/use-pane-session.ts";
import {
	type PaneSessionOptions,
	type PaneTheme,
} from "#ui/rules/pane-session/session-contracts.ts";
import {
	createPaneWorkbenchSocketOwner,
	type PaneWorkbenchSocketOwner,
} from "#ui/clients/pane-session/workbench-socket.ts";
import { ArchitectureModelStage } from "#ui/components/architecture-model/ArchitectureModelStage.tsx";
import { type WalkthroughNarration } from "#ui/rules/semantic-board-canvas/walkthrough/narration.ts";
import {
	createBrowserWorkbenchTransport,
	type BrowserWorkbenchTransport,
} from "@archboard/codex-realtime-voice/controllers";
import type { PanePresentRequestSchema } from "@archboard/board/pane-context";
import type { z } from "zod";

type PanePresentRequest = z.infer<typeof PanePresentRequestSchema>;

/** Inputs for one application pane. */
interface ApplicationPaneProps {
	paneId: string;
	primary: boolean;
	focused: boolean;
	theme: PaneTheme;
	callbacks: PaneCallbacks;
	handles: PaneHandles;
	/** Narrating this pane's walkthroughs aloud, when the shell can start voice for it. */
	narration?: WalkthroughNarration | undefined;
	/** What the shell lays over this pane's picture, such as subtitles of the voice running for it. */
	overlay?: ReactNode;
	/** Whether the person asked for reduced motion. */
	reducedMotion: boolean;
	/** The vault the pane opens in, until the server moves it (ADR 0050). */
	openingVault: string;
	/** A walkthrough step the page moves this pane to itself (a recording, TASK-304), or null. */
	step?: ComponentProps<typeof RecordedModelStage>["driven"];
	/** The pane is a recording page's, which the server leaves out of addressing (TASK-304). */
	recording?: boolean;
	/**
	 * Hear what this pane is reading, as well as reporting it (a recording, TASK-304).
	 * @param reading The board, variant, view, selection and presentation on screen.
	 */
	onRecordedReading?: ((reading: PaneReading) => void) | undefined;
	/** Undefined for ordinary reading, null until a canonical capture loads. */
	recordedArchitecture?: Model | null | undefined;
}

/** The pane-bound callbacks the shared ones cannot supply. */
interface BoundCallbacks {
	onBoardError: (error: string) => void;
	onLayoutRequest: (request: "open" | "close") => void;
	createWorkbenchSockets: () => PaneWorkbenchSocketOwner<BrowserWorkbenchTransport>;
}

/**
 * The session options for one pane over the shared callbacks.
 * @param props The pane's inputs.
 * @param bound The pane-bound callbacks.
 * @returns The options.
 */
function optionsFor(
	props: ApplicationPaneProps,
	bound: BoundCallbacks,
): PaneSessionOptions<BrowserWorkbenchTransport> {
	const { callbacks } = props;
	return {
		paneId: props.paneId,
		primary: props.primary,
		focused: props.focused,
		recording: props.recording === true,
		theme: props.theme,
		openingVault: props.openingVault,
		onStatus: callbacks.onStatus,
		onHolder: callbacks.onHolder,
		onPaneStateAccepted: callbacks.onPaneStateAccepted,
		onPaneReconnected: callbacks.onPaneReconnected,
		onPaneRetired: callbacks.onPaneRetired,
		onStaleFrontend: callbacks.onStaleFrontend,
		onCodeTargetNotice: callbacks.onCodeTargetNotice,
		onAgentActivity: callbacks.onAgentActivity,
		onRepositoriesChanged: callbacks.onRepositoriesChanged,
		onBoardAdopted: callbacks.onBoardAdopted,
		onBoardError: bound.onBoardError,
		onLayoutRequest: bound.onLayoutRequest,
		createWorkbenchSockets: bound.createWorkbenchSockets,
	};
}

/**
 * The callbacks one pane binds to itself, which the shared ones cannot supply.
 * @param props The pane's inputs.
 * @returns The bound callbacks, stable while the pane is.
 */
function useBoundCallbacks(props: ApplicationPaneProps): BoundCallbacks {
	const { paneId, callbacks, handles } = props;
	const onBoardError = useCallback(
		(error: string): void => callbacks.onBoardError(paneId, error),
		[callbacks, paneId],
	);
	const onLayoutRequest = useCallback(
		(request: "open" | "close"): void => callbacks.onLayoutRequest(paneId, request),
		[callbacks, paneId],
	);
	const createWorkbenchSockets = useCallback(
		(): PaneWorkbenchSocketOwner<BrowserWorkbenchTransport> =>
			createPaneWorkbenchSocketOwner({
				media: handles.media(paneId),
				createTransport: createBrowserWorkbenchTransport,
			}),
		[handles, paneId],
	);
	return useMemo(
		() => ({ onBoardError, onLayoutRequest, createWorkbenchSockets }),
		[onBoardError, onLayoutRequest, createWorkbenchSockets],
	);
}

/**
 * One pane owns its session and canonical architecture reading.
 * @param props The pane's identity, facets, theme, callbacks, handles and reading.
 * @returns The mounted pane.
 */
function ApplicationPane(props: ApplicationPaneProps): JSX.Element {
	const { paneId, callbacks, onRecordedReading } = props;
	const bound = useBoundCallbacks(props);
	// A step somebody narrating a walkthrough asked for (TASK-251). Kept with the
	// pane because it is about this pane's picture, and handed to the stage, which
	// owns where the pane is in a walkthrough and answers through its reading.
	const [asked, onPresentRequest] = useState<PanePresentRequest | null>(null);
	const [canonicalReading, reportCanonicalReading] = useState<PaneReading | null>(null);
	const client = useQueryClient();
	const refreshExplanations = useCallback((): void => {
		void client.invalidateQueries({ queryKey: explanationKey(tabSessionId()) });
	}, [client]);
	const options = useMemo(
		() => ({
			...optionsFor(props, bound),
			canonical: true,
			onPresentRequest,
			onExplanationsChanged: refreshExplanations,
		}),
		[props, bound, refreshExplanations],
	);
	const session = usePaneSession(options);
	const { attachPaneElement, readingChanged, vault } = session;
	const narration = usePublishedNarration(
		props.narration,
		session.flushReading,
		bound.onBoardError,
	);
	// The pictures of the vault this pane is in follow that vault's policy.
	useVaultPolicyRefresh(vault);
	// Registration and departure are two different events, and they are two
	// effects for that reason. `usePaneSession` hands back a fresh object every
	// render — its board, its holder and what an agent is doing all change under
	// it — so a single effect with the session in its dependencies would report
	// the pane gone and back on every ordinary piece of news. The workbench
	// answers "gone" by tearing down the pane's media and its thread binding, so
	// that is not a re-registration, it is a disconnection per render.
	useEffect(() => {
		callbacks.onSession(paneId, session);
	}, [callbacks, paneId, session]);
	useEffect(() => () => callbacks.onSession(paneId, null), [callbacks, paneId]);
	// The element the pane fills, measured for the pane report: taken through a
	// callback ref rather than read during render, which is the only moment a
	// ref's value is not a rendering input.
	const attachStage = useCallback(
		(element: HTMLDivElement | null): void => attachPaneElement(element),
		[attachPaneElement],
	);
	const reading = canonicalReading ?? NOTHING_READ;
	useEffect(() => {
		readingChanged(reading);
		onRecordedReading?.(reading);
	}, [reading, readingChanged, onRecordedReading]);

	return (
		<div
			data-slot="pane-stage"
			data-pane={paneId}
			ref={attachStage}
			className="relative flex min-h-0 min-w-0 flex-1 flex-col"
		>
			<ModelExplanationHost
				vault={vault}
				connected={session.connected}
				focused={props.focused}
				onReading={reportCanonicalReading}
			>
				{props.recordedArchitecture !== undefined ? (
					<RecordedModelStage
						model={props.recordedArchitecture}
						vault={vault}
						driven={props.step}
						reducedMotion={props.reducedMotion}
						overlay={props.overlay}
					/>
				) : (
					<ArchitectureModelStage
						key={vault}
						vault={vault}
						paneId={paneId}
						reducedMotion={props.reducedMotion}
						onCodeTargetNotice={callbacks.onCodeTargetNotice}
						driven={asked}
						narration={narration}
						overlay={props.overlay}
					/>
				)}
			</ModelExplanationHost>
		</div>
	);
}

export { ApplicationPane, type ApplicationPaneProps };
