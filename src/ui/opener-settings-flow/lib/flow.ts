// The opener settings flow: read the settings, test a selection against a
// registered checkout, save it, or reset to the platform default. Pure state
// over an injected api, so the dialog only renders and reports.

import type {
	CodeTargetNotice,
	CodeTargetOpenFailure,
	OpenerSelection,
	OpenerSelectionReply,
	OpenerSettingsReply,
	OpenerSettingsTestRequest,
	OpenerTestReply,
} from "@/shared/code-target";
import type { DialogError } from "@/ui/board-dialogs";
import {
	fetchOpenerSettings,
	resetOpenerSettings,
	saveOpenerSettings,
	testOpenerSettings,
} from "@/ui/canvas/api";

/** The server calls the flow makes. */
interface OpenerSettingsApi {
	readonly fetch: () => Promise<OpenerSettingsReply | CodeTargetOpenFailure>;
	readonly save: (
		selection: OpenerSelection,
	) => Promise<OpenerSelectionReply | CodeTargetOpenFailure>;
	readonly reset: () => Promise<OpenerSelectionReply | CodeTargetOpenFailure>;
	readonly test: (
		selection: OpenerSelection,
		repository: string,
	) => Promise<OpenerTestReply | CodeTargetOpenFailure>;
}

/** The three actions, each with its own in-flight state. */
interface OpenerSettingsBusy {
	readonly test: boolean;
	readonly save: boolean;
	readonly reset: boolean;
}

/** What the dialog renders. */
interface OpenerSettingsFlowState {
	/** The settings as the server answered, or null while unread or unreadable. */
	readonly settings: OpenerSettingsReply | null;
	/** The first read is in flight. */
	readonly loading: boolean;
	readonly busy: OpenerSettingsBusy;
	/** What the last test answered, or null before one. */
	readonly testResult: OpenerTestReply | CodeTargetOpenFailure | null;
	/** The last failure, kept until the next action clears it. */
	readonly error: DialogError | null;
}

/** Who hears the flow's outcomes. */
interface OpenerSettingsFlowListener {
	readonly onSuccess: (message: string) => void;
	readonly onFailure: (notice: CodeTargetNotice) => void;
	/** The selection was saved; the dialog can close. */
	readonly onSaved: () => void;
}

/** The flow. */
interface OpenerSettingsFlow {
	readonly getSnapshot: () => OpenerSettingsFlowState;
	readonly subscribe: (listener: () => void) => () => void;
	readonly load: () => Promise<void>;
	readonly test: (request: OpenerSettingsTestRequest) => Promise<void>;
	readonly save: (selection: OpenerSelection) => Promise<void>;
	readonly reset: () => Promise<void>;
}

/** What the flow needs. */
interface OpenerSettingsFlowOptions {
	readonly listener: OpenerSettingsFlowListener;
	readonly api?: OpenerSettingsApi;
}

const SERVER_API: OpenerSettingsApi = {
	fetch: fetchOpenerSettings,
	save: saveOpenerSettings,
	reset: resetOpenerSettings,
	test: testOpenerSettings,
};

const IDLE_BUSY: OpenerSettingsBusy = Object.freeze({ test: false, save: false, reset: false });

const SAVED_MESSAGE = "Saved. Every pane and caller uses this opener on the next activation.";
const RESET_MESSAGE = "Reset to the system default for every pane and caller.";

/**
 * The notice for a typed failure.
 * @param failure The failure.
 * @returns The notice, with the failure's actions.
 */
function noticeOf(failure: CodeTargetOpenFailure): CodeTargetNotice {
	return { kind: "error", message: failure.error, actions: failure.actions ?? [] };
}

/**
 * The dialog error for a typed failure.
 * @param failure The failure.
 * @returns The error, titled by what was attempted.
 */
function errorOf(failure: CodeTargetOpenFailure): DialogError {
	return { title: "Opener settings", message: failure.error };
}

/**
 * Create the flow.
 * @param options The listener and, for tests, the api.
 * @returns The flow.
 */
function createOpenerSettingsFlow(options: OpenerSettingsFlowOptions): OpenerSettingsFlow {
	const api = options.api ?? SERVER_API;
	const { listener } = options;
	const listeners = new Set<() => void>();
	let state: OpenerSettingsFlowState = {
		settings: null,
		loading: false,
		busy: IDLE_BUSY,
		testResult: null,
		error: null,
	};

	/**
	 * Move to a new state and tell subscribers.
	 * @param next What changes.
	 */
	function update(next: Partial<OpenerSettingsFlowState>): void {
		state = { ...state, ...next };
		for (const notify of listeners) {
			notify();
		}
	}

	/**
	 * A server call failed: keep the error, tell the listener.
	 * @param failure The failure.
	 */
	function fail(failure: CodeTargetOpenFailure): void {
		const notice = noticeOf(failure);
		update({ error: errorOf(failure) });
		listener.onFailure(notice);
	}

	/**
	 * Mark one action busy or idle.
	 * @param action The action.
	 * @param inFlight Whether it is in flight.
	 */
	function setBusy(action: keyof OpenerSettingsBusy, inFlight: boolean): void {
		update({ busy: { ...state.busy, [action]: inFlight } });
	}

	/** Read the settings. */
	async function load(): Promise<void> {
		update({ loading: true, error: null });
		const result = await api.fetch();
		if (!result.success) {
			update({ loading: false, settings: null });
			fail(result);
			return;
		}
		update({ loading: false, settings: result });
	}

	/**
	 * Launch a selection against a registered checkout without saving it.
	 * @param request The selection and checkout.
	 */
	async function test(request: OpenerSettingsTestRequest): Promise<void> {
		setBusy("test", true);
		update({ error: null });
		const result = await api.test(request.selection, request.repository);
		setBusy("test", false);
		update({ testResult: result });
		if (!result.success) {
			fail(result);
			return;
		}
		listener.onSuccess(`Test opener launched for ${result.repository}.`);
	}

	/**
	 * Persist a selection.
	 * @param selection The selection.
	 */
	async function save(selection: OpenerSelection): Promise<void> {
		setBusy("save", true);
		update({ error: null });
		const result = await api.save(selection);
		setBusy("save", false);
		if (!result.success) {
			fail(result);
			return;
		}
		listener.onSuccess(SAVED_MESSAGE);
		listener.onSaved();
	}

	/** Restore the platform default, then read the settings again. */
	async function reset(): Promise<void> {
		setBusy("reset", true);
		update({ error: null });
		const result = await api.reset();
		if (!result.success) {
			setBusy("reset", false);
			fail(result);
			return;
		}
		listener.onSuccess(RESET_MESSAGE);
		await load();
		setBusy("reset", false);
	}

	/**
	 * Hear about changes.
	 * @param notify What to call.
	 * @returns Stops listening.
	 */
	function subscribe(notify: () => void): () => void {
		listeners.add(notify);
		return () => listeners.delete(notify);
	}

	/**
	 * What the dialog renders.
	 * @returns The state.
	 */
	function getSnapshot(): OpenerSettingsFlowState {
		return state;
	}

	return { getSnapshot, subscribe, load, test, save, reset };
}

export {
	createOpenerSettingsFlow,
	type OpenerSettingsApi,
	type OpenerSettingsBusy,
	type OpenerSettingsFlow,
	type OpenerSettingsFlowListener,
	type OpenerSettingsFlowOptions,
	type OpenerSettingsFlowState,
};
