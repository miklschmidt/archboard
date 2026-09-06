// The reporting runtime of one pane: the reducer's state, its timers, the one
// request in flight, and the only function that calls Excalidraw's
// programmatic scene update. Everything the reducer asks for is done here.

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import {
	BoardConflictError,
	BoardVersionConflictError,
	beaconChanges,
	fetchElements,
	fetchFiles,
	reportChanges,
	type ChangeReportReply,
} from "@/ui/canvas/api";
import {
	EMPTY_WITHHELD,
	carryWithheld,
	hasPendingEdits,
	initialState,
	mergeIncoming,
	mergeIncomingDeletes,
	needsFullReport,
	reduce,
	reportsSettled,
	userHasInteracted,
	type ChangeReportingEffect,
	type ChangeReportingEvent,
	type SceneElement,
	type SceneUpdate,
} from "@/ui/canvas/change-reporting";
import {
	cancelReportingTimer,
	createReportingRuntime,
	startReportingTimer,
	timerFiredEvent,
	timerOfEffect,
	type ReportingRuntime,
} from "@/ui/canvas/lib/reporting-runtime";
import {
	idUnderEditor,
	sceneUpdateData,
	showNoteScene,
} from "@/ui/canvas/lib/reporting-scene-update";
import { sceneFromExcalidraw, sceneFromServer } from "@/ui/canvas/lib/scene-boundary";
import type { BoardHold, EditWithdrawalReason, ServerElement } from "@/ui/types";

/** What the runtime needs from its pane. */
interface ReportingHost {
	readonly clientId: string;
	readonly api: () => ExcalidrawImperativeAPI | null;
	readonly boardKey: () => string | null;
	readonly takeHold: () => void;
	readonly releaseIfIdle: (settled: boolean) => void;
	readonly noteChange: () => void;
	readonly publishStatus: () => void;
	readonly setHold: (hold: BoardHold | null) => void;
	/** The person's unwritten edit was withdrawn and the note's state shown (ADR 0022). */
	readonly editsWithdrawn: (reason: EditWithdrawalReason) => void;
	/** The note version the pane states on its writes changed (ADR 0022). */
	readonly noteVersionChanged: (version: number | null) => void;
	/** The pane's element, where Excalidraw's text editor lives. */
	readonly stage: () => HTMLElement | null;
}

/** What the refusal said the note holds, when it said. */
interface WithdrawalNote {
	readonly document?: readonly ServerElement[] | undefined;
	readonly version?: number | null | undefined;
}

/** One pane's reporting runtime. */
interface Reporting {
	readonly dispatch: (event: ChangeReportingEvent) => void;
	readonly currentScene: () => readonly SceneElement[];
	readonly currentWithheldIds: () => readonly string[];
	readonly hasPendingChanges: () => boolean;
	readonly needsFullReport: () => boolean;
	readonly userInteracted: () => boolean;
	readonly settled: () => boolean;
	/** Report now, and wait for the answer. */
	readonly sendReport: () => Promise<void>;
	/** Excalidraw reported a change. */
	readonly sceneChanged: (scene: readonly SceneElement[]) => void;
	/** The page is unloading. */
	readonly flushWithBeacon: () => void;
	/** Replace the scene outright, carrying withheld elements over. */
	readonly applyServerScene: (elements: SceneElement[], withheldIds?: readonly string[]) => void;
	/** Fold specific server elements into the scene. */
	readonly applyServerElements: (incoming: SceneElement[]) => void;
	readonly removeElements: (ids: readonly string[]) => void;
	/** Move the camera as a viewport request asks. */
	readonly applyCamera: (appState: Record<string, unknown>) => void;
	/** Re-read this pane's board from the server. */
	readonly loadBoard: () => Promise<void>;
	/** The server said which note version the board on screen came from. */
	readonly learnNoteVersion: (version: number | null | undefined) => void;
	/** An agent's claim stands: withdraw the person's unwritten edits (ADR 0022). */
	readonly withdrawForClaim: (note: WithdrawalNote) => void;
}

type ApplyEffect = Extract<
	ChangeReportingEffect,
	{ type: "apply_server_update" | "apply_local_update" }
>;
type EffectType = ChangeReportingEffect["type"];
type EffectMap = { [Type in EffectType]: Extract<ChangeReportingEffect, { type: Type }> };
type Executors = { [Type in EffectType]: (effect: EffectMap[Type]) => void };

/**
 * Run the executor for one effect type.
 * @param executors The executors by type.
 * @param type The effect's type.
 * @param effect The effect.
 */
function run<Type extends EffectType>(
	executors: Executors,
	type: Type,
	effect: EffectMap[Type],
): void {
	executors[type](effect);
}

/**
 * Create the reporting runtime for one pane.
 * @param host What the runtime reads and calls.
 * @returns The runtime.
 */
function createReporting(host: ReportingHost): Reporting {
	const runtime: ReportingRuntime = createReportingRuntime(initialState());

	/**
	 * The scene as Excalidraw holds it, deleted elements included.
	 * @returns The scene, empty before the canvas mounts.
	 */
	function currentScene(): readonly SceneElement[] {
		const api = host.api();
		return api ? sceneFromExcalidraw(api.getSceneElementsIncludingDeleted()) : [];
	}

	/**
	 * The scene as Excalidraw draws it.
	 * @returns The live elements, empty before the canvas mounts.
	 */
	function liveScene(): readonly SceneElement[] {
		const api = host.api();
		return api ? sceneFromExcalidraw(api.getSceneElements()) : [];
	}

	/**
	 * The ids withheld from reports right now.
	 * @returns The id under the editor, or none.
	 */
	function currentWithheldIds(): readonly string[] {
		const editing = idUnderEditor(host.api());
		return editing === null ? EMPTY_WITHHELD : [editing];
	}

	/**
	 * Run the reducer and its effects.
	 * @param event What happened.
	 */
	function dispatch(event: ChangeReportingEvent): void {
		const before = runtime.state.noteVersion;
		const result = reduce(runtime.state, event);
		runtime.state = result.state;
		if (result.state.noteVersion !== before) {
			host.noteVersionChanged(result.state.noteVersion);
		}
		for (const effect of result.effects) {
			execute(effect);
		}
	}

	/**
	 * The only function that calls Excalidraw's programmatic scene update.
	 * @param update What to apply.
	 * @param effect The effect asking for it, so the right completion is dispatched.
	 */
	function applySceneUpdate(update: SceneUpdate, effect: ApplyEffect): void {
		const api = host.api();
		if (!api) {
			return;
		}
		api.updateScene(sceneUpdateData(update));
		const scene = currentScene();
		if (effect.type === "apply_local_update") {
			dispatch({ type: "local_update_applied", generation: effect.generation, scene });
			return;
		}
		dispatch({
			type: "server_update_applied",
			generation: effect.generation,
			scene,
			baselineUpdate: effect.baselineUpdate,
			...(effect.reportAfterUpdate ? { reportAfterUpdate: effect.reportAfterUpdate } : {}),
		});
	}

	/**
	 * Put a report on the wire and feed its outcome back.
	 * @param effect The send effect.
	 */
	function send(effect: Extract<ChangeReportingEffect, { type: "send_report" }>): void {
		const request: Promise<ChangeReportReply | null> = reportChanges(
			host.boardKey(),
			effect.report,
			host.clientId,
			effect.expectVersion,
			effect.fullReport,
		)
			.then((reply) => {
				host.setHold(reply.held ?? null);
				dispatch({
					type: "report_succeeded",
					generation: effect.generation,
					corrections: {
						upserts: sceneFromServer(reply.corrections.upserts),
						deletes: reply.corrections.deletes,
					},
					currentScene: currentScene(),
					version: reply.fingerprint.version,
				});
				return reply;
			})
			.catch((error: unknown) => {
				refused(error, effect.generation);
				return null;
			})
			.finally(() => {
				if (runtime.reportPromise === request) {
					runtime.reportPromise = null;
				}
			});
		runtime.reportPromise = request;
	}

	/**
	 * A report did not land. A version conflict is the note deciding (ADR 0022):
	 * the refusal's document replaces the scene, an open editor included. A
	 * hash conflict is the held-board recovery (ADR 0006); anything else is
	 * retried.
	 * @param error What the request threw.
	 * @param generation The generation the report was sent in.
	 */
	function refused(error: unknown, generation: number): void {
		if (error instanceof BoardVersionConflictError) {
			if (runtime.state.generation !== generation) {
				return;
			}
			dispatch({ type: "report_version_refused", generation, version: error.version });
			showNoteScene(host.api(), host.stage(), sceneFromServer([...error.document]), dispatch);
			host.editsWithdrawn("moved");
			return;
		}
		if (error instanceof BoardConflictError) {
			if (error.held) {
				host.setHold(error.held);
			}
			dispatch({ type: "report_refused", generation });
			return;
		}
		dispatch({ type: "report_failed", generation });
	}

	/**
	 * Arm a timer effect.
	 * @param effect The start effect.
	 */
	function startTimer(
		effect: Extract<
			ChangeReportingEffect,
			{ type: "start_progress_timer" | "start_idle_timer" | "start_retry_timer" }
		>,
	): void {
		const which = timerOfEffect(effect);
		if (which === null) {
			return;
		}
		startReportingTimer(runtime, which, effect.delayMs, () => {
			dispatch(timerFiredEvent(which, effect.generation, currentScene(), currentWithheldIds()));
		});
	}

	/**
	 * Finish a server update on the next tick, once Excalidraw has settled.
	 * @param generation The generation the update was applied in.
	 */
	function finishServerUpdate(generation: number): void {
		setTimeout(() => {
			dispatch({
				type: "server_update_finished",
				generation,
				scene: currentScene(),
				withheldIds: currentWithheldIds(),
			});
			host.publishStatus();
		}, 0);
	}

	/**
	 * Cancel a timer effect.
	 * @param effect The cancel effect.
	 */
	function cancelTimer(effect: ChangeReportingEffect): void {
		const which = timerOfEffect(effect);
		if (which !== null) {
			cancelReportingTimer(runtime, which);
		}
	}

	/**
	 * Apply a scene update effect.
	 * @param effect The apply effect.
	 */
	function applyUpdate(effect: ApplyEffect): void {
		applySceneUpdate(effect.update, effect);
	}

	/**
	 * Beacon a report on the way out.
	 * @param effect The beacon effect.
	 */
	function sendBeacon(effect: Extract<ChangeReportingEffect, { type: "send_beacon" }>): void {
		beaconChanges(host.boardKey(), effect.report, host.clientId, effect.expectVersion);
	}

	/**
	 * Finish a server update, on the next tick.
	 * @param effect The finish effect.
	 */
	function finish(effect: Extract<ChangeReportingEffect, { type: "finish_server_update" }>): void {
		finishServerUpdate(effect.generation);
	}

	/** Release the hold when every report has settled. */
	function releaseIfIdle(): void {
		host.releaseIfIdle(reportsSettled(runtime.state));
	}

	const executors: Executors = {
		cancel_progress_timer: cancelTimer,
		cancel_idle_timer: cancelTimer,
		cancel_retry_timer: cancelTimer,
		start_progress_timer: startTimer,
		start_idle_timer: startTimer,
		start_retry_timer: startTimer,
		apply_local_update: applyUpdate,
		apply_server_update: applyUpdate,
		finish_server_update: finish,
		send_report: send,
		send_beacon: sendBeacon,
		take_hold: host.takeHold,
		note_change: host.noteChange,
		release_if_idle: releaseIfIdle,
		publish_status: host.publishStatus,
	};

	/**
	 * Run one effect.
	 * @param effect The effect.
	 */
	function execute(effect: ChangeReportingEffect): void {
		run(executors, effect.type, effect);
	}

	/**
	 * Replace the scene outright; the board is now exactly what the server said,
	 * except for what this pane deliberately did not tell the server about. A
	 * text element under an open editor is withheld from the report that
	 * provoked this answer, so the answer cannot contain it; it is carried over
	 * and stays out of the baseline (TASK-098).
	 * @param elements The server's scene.
	 * @param withheldIds Ids under an open editor.
	 */
	function applyServerScene(elements: SceneElement[], withheldIds = EMPTY_WITHHELD): void {
		if (!host.api()) {
			return;
		}
		const answered = new Set(elements.map((element) => element.id));
		const kept = carryWithheld(currentScene(), answered, withheldIds);
		dispatch({
			type: "server_update_requested",
			update: { elements: [...elements, ...kept], captureUpdate: "never" },
			baselineUpdate: { type: "replace", withheldIds },
		});
	}

	/**
	 * Fold specific server elements into whatever is on screen, re-agreeing the
	 * baseline for those ids only; the rest of the scene may hold local edits.
	 * @param incoming The server's elements.
	 */
	function applyServerElements(incoming: SceneElement[]): void {
		if (!host.api() || incoming.length === 0) {
			return;
		}
		const { elements } = mergeIncoming(liveScene(), incoming, runtime.state.baseline);
		dispatch({
			type: "server_update_requested",
			update: { elements, captureUpdate: "never" },
			baselineUpdate: { type: "touch", elements: incoming },
		});
	}

	/**
	 * Remove elements the server deleted, keeping any edited since.
	 * @param ids The deleted ids.
	 */
	function removeElements(ids: readonly string[]): void {
		if (!host.api() || ids.length === 0) {
			return;
		}
		const elements = mergeIncomingDeletes(liveScene(), ids, runtime.state.baseline);
		dispatch({
			type: "server_update_requested",
			update: { elements, captureUpdate: "never" },
			baselineUpdate: { type: "delete", ids },
		});
	}

	/**
	 * Move the camera as a viewport request asks, through the runtime so the
	 * change is not mistaken for a person's edit.
	 * @param appState The camera fields.
	 */
	function applyCamera(appState: Record<string, unknown>): void {
		dispatch({
			type: "server_update_requested",
			update: { appState, captureUpdate: "never" },
			baselineUpdate: { type: "none" },
		});
	}

	/**
	 * Re-read this pane's board. Deliberately not "what board is the server on":
	 * a pane learns which board it holds from the server addressing it (ADR 0009).
	 */
	async function loadBoard(): Promise<void> {
		const boardKey = host.boardKey();
		if (!host.api() || boardKey === null) {
			return;
		}
		try {
			await readBoard(boardKey);
		} catch {
			// The next server frame carries the board; a failed read is not fatal.
		}
	}

	/**
	 * Read a board's elements and files from the server into the scene.
	 * @param boardKey The board.
	 */
	async function readBoard(boardKey: string): Promise<void> {
		const { elements } = await fetchElements(boardKey);
		applyServerScene(sceneFromServer(elements));
		const { files } = await fetchFiles(boardKey);
		if (files && Object.keys(files).length > 0) {
			host.api()?.addFiles(Object.values(files));
		}
	}

	/**
	 * The server said which note version the board on screen came from.
	 * @param version The version, null for a note without one; undefined is silence.
	 */
	function learnNoteVersion(version: number | null | undefined): void {
		if (version !== undefined) {
			dispatch({ type: "note_version_learned", version });
		}
	}

	/**
	 * An agent's claim stands where the person just edited (ADR 0022): what
	 * they drew is withdrawn and the board shows the note. The refusal carries
	 * the note's document; failing that, the board is read again, because the
	 * baseline is fingerprints and the note is the one place to read it from.
	 * @param note The document and version the refusal carried, if any.
	 */
	function withdrawForClaim(note: WithdrawalNote): void {
		if (!host.api()) {
			return;
		}
		dispatch({ type: "edits_withdrawn" });
		host.editsWithdrawn("claimed");
		if (note.document === undefined) {
			void loadBoard();
			return;
		}
		learnNoteVersion(note.version);
		showNoteScene(host.api(), host.stage(), sceneFromServer([...note.document]), dispatch);
	}

	/** Report now, and wait for the answer. */
	async function sendReport(): Promise<void> {
		if (!host.api()) {
			return;
		}
		dispatch({
			type: "immediate_report_requested",
			scene: currentScene(),
			withheldIds: currentWithheldIds(),
		});
		await runtime.reportPromise;
	}

	/**
	 * Excalidraw reported a change.
	 * @param scene The elements Excalidraw supplied.
	 */
	function sceneChanged(scene: readonly SceneElement[]): void {
		if (host.api()) {
			dispatch({ type: "scene_changed", scene });
		}
	}

	/** The page is unloading: beacon whatever is pending. */
	function flushWithBeacon(): void {
		if (host.api() && typeof navigator.sendBeacon === "function") {
			dispatch({ type: "flush_requested", scene: currentScene() });
		}
	}

	/**
	 * Whether the scene holds anything the server has not been told.
	 * @returns True when an edit is pending.
	 */
	function hasPendingChanges(): boolean {
		return hasPendingEdits(runtime.state, currentScene(), currentWithheldIds());
	}

	/**
	 * Whether the next report must be a full one (TASK-079).
	 * @returns True after a refusal.
	 */
	function fullReportNeeded(): boolean {
		return needsFullReport(runtime.state);
	}

	/**
	 * Whether the person has touched this pane.
	 * @returns True once a gesture has been seen.
	 */
	function interacted(): boolean {
		return userHasInteracted(runtime.state);
	}

	/**
	 * Whether nothing is scheduled, in flight or queued.
	 * @returns True when settled.
	 */
	function settled(): boolean {
		return reportsSettled(runtime.state);
	}

	return {
		dispatch,
		currentScene,
		currentWithheldIds,
		hasPendingChanges,
		needsFullReport: fullReportNeeded,
		userInteracted: interacted,
		settled,
		sendReport,
		sceneChanged,
		flushWithBeacon,
		applyServerScene,
		applyServerElements,
		removeElements,
		applyCamera,
		loadBoard,
		learnNoteVersion,
		withdrawForClaim,
	};
}

export { createReporting, type Reporting, type ReportingHost };
