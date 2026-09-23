// Nothing to set up before talking to the agent. A message sent, or Talk
// pressed, while the agent is not ready is held here and carried through
// whatever is missing, in order: sign in to Archboard's own Codex (the
// provider page opens from the person's gesture), wait for Codex to start,
// create the conversation — an explicit workhorse create (ADR 0019), never an
// adoption — and only then deliver it. Each held message is visible where it
// waits and says what it waits on; a failure stays on the message with the
// reason, and nothing is retried behind the person's back (DESIGN §2).

import type { LoginId } from "@/shared/codex-workbench-identity";
import type { WorkbenchComposerSubmissionResult } from "@/ui/workbench-composer";
import type { ThreadLinkLoginParams } from "@/ui/workbench-thread-link/transport-port";
import type { BrowserWorkbenchState } from "@/ui/workbench-transport";

import { agentPhase, type AgentPhase } from "@/ui/agent-setup/lib/phase";

/** How one step the setup asked for settled. */
type SetupStepResult = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/** A browser tab opened by the person's gesture, pointed at the sign-in page once it is known. */
interface AuthTab {
	/**
	 * Show the provider's sign-in page.
	 * @param url The page.
	 */
	readonly navigate: (url: string) => void;
	/** Close the tab: the sign-in could not start. */
	readonly close: () => void;
}

/** What the setup reaches for. */
interface AgentSetupPorts {
	readonly transport: {
		readonly state: () => BrowserWorkbenchState;
		readonly subscribe: (listener: () => void) => () => void;
	};
	/** Create a new conversation for this canvas. */
	readonly createConversation: () => Promise<SetupStepResult>;
	/**
	 * Start a sign-in.
	 * @param login The provider and its credentials.
	 */
	readonly signIn: (login: ThreadLinkLoginParams) => Promise<SetupStepResult>;
	/**
	 * Cancel a pending sign-in.
	 * @param loginId The sign-in.
	 */
	readonly cancelSignIn: (loginId: LoginId) => Promise<SetupStepResult>;
	/**
	 * Deliver one message: steered into a running turn, queued when asked, sent otherwise.
	 * @param text The message.
	 * @param queue Whether the person asked to queue it behind the running turn.
	 */
	readonly submit: (text: string, queue: boolean) => Promise<WorkbenchComposerSubmissionResult>;
	/**
	 * Start voice.
	 * @param walkthrough The walkthrough to narrate, or null for a conversation.
	 */
	readonly startVoice: (walkthrough: string | null) => Promise<void>;
}

/** Where one held message stands. */
type HeldState = "waiting" | "sending" | "delivered" | "failed" | "unknown";

/** A message the person sent that the conversation does not show yet. */
interface HeldMessage {
	readonly id: string;
	readonly text: string;
	/** The person asked for it to run after the current turn. */
	readonly queue: boolean;
	readonly state: HeldState;
	/** Why it was not delivered, or why its outcome is unknown. */
	readonly reason: string | null;
	/** The turn it went into, once delivered. */
	readonly turnId: string | null;
}

/** What the agent waits on for the person's held work. */
type SetupStep = "sign_in" | "start" | "link" | null;

/** Everything the setup publishes. */
interface AgentSetupSnapshot {
	readonly phase: AgentPhase;
	readonly held: readonly HeldMessage[];
	/** Talk was pressed and voice is being set up: waiting on a step, or starting. */
	readonly talk: "idle" | "waiting" | "starting";
	readonly step: SetupStep;
	/** The last step that failed, in the words of whatever refused it. */
	readonly failure: string | null;
	/** Why the last Talk did not start voice, or null. */
	readonly talkFailure: string | null;
}

/** How a message is sent. */
interface SendOptions {
	readonly queue?: boolean | undefined;
	readonly tab?: AuthTab | undefined;
}

/** How voice is started. */
interface TalkOptions {
	/** Narrate this walkthrough of the board in view, rather than converse. */
	readonly walkthrough?: string | undefined;
	readonly tab?: AuthTab | undefined;
}

/** The setup's controls. */
interface AgentSetup {
	/**
	 * Listen for new snapshots.
	 * @param listener Called after each change.
	 * @returns Stops listening.
	 */
	readonly subscribe: (listener: () => void) => () => void;
	/** The current snapshot. */
	readonly snapshot: () => AgentSetupSnapshot;
	/**
	 * Send a message, setting up whatever is missing first.
	 * @param text The message.
	 * @param options Whether to queue it, and a tab opened by the gesture for a sign-in.
	 */
	readonly send: (text: string, options?: SendOptions) => void;
	/**
	 * Start voice, setting up whatever is missing first.
	 * @param options A walkthrough to narrate, and a tab opened by the gesture for a sign-in.
	 */
	readonly talk: (options?: TalkOptions) => void;
	/**
	 * Sign in.
	 * @param login The provider and its credentials.
	 * @param tab A tab opened by the gesture, for the provider's page.
	 */
	readonly signIn: (login: ThreadLinkLoginParams, tab?: AuthTab) => void;
	/** Cancel the pending sign-in. */
	readonly cancelSignIn: () => void;
	/** Start a new conversation for this canvas. */
	readonly newConversation: () => void;
	/**
	 * Send a message that failed again.
	 * @param id The held message.
	 */
	readonly retry: (id: string) => void;
	/**
	 * Drop a held message the person no longer wants sent.
	 * @param id The held message.
	 * @returns Its text, for putting it back in the composer.
	 */
	readonly discard: (id: string) => string | null;
	/**
	 * Listen to the transport, carrying held work forward as it changes.
	 * @returns Stops listening.
	 */
	readonly connect: () => () => void;
}

/** What held work waits on, by phase. */
const STEP_BY_PHASE: Readonly<Record<AgentPhase["kind"], SetupStep>> = {
	connecting: "start",
	unavailable: "start",
	starting: "start",
	signed_out: "sign_in",
	signing_in: "sign_in",
	ready: "link",
};

/**
 * Words for anything thrown.
 * @param error What was thrown.
 * @returns Its message.
 */
function words(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Whether the timeline shows a delivered message: its turn is there and holds
 * a prompt with its words, or the turn has already ended.
 * @param state The transport state.
 * @param message The held message.
 * @returns True once the conversation shows it.
 */
function shownInTimeline(state: BrowserWorkbenchState, message: HeldMessage): boolean {
	const turn = state.snapshot?.timeline?.turns.find((entry) => entry.turnId === message.turnId);
	if (turn === undefined) return false;
	const said = message.text.trim();
	return (
		turn.status !== "inProgress" ||
		turn.items.some((item) => item.media === "prompt" && item.text.trim() === said)
	);
}

/**
 * The held messages once one settled delivery is recorded.
 * @param held The held messages.
 * @param id The message.
 * @param result What the composer said.
 * @returns The held messages.
 */
function settleDelivery(
	held: readonly HeldMessage[],
	id: string,
	result: WorkbenchComposerSubmissionResult,
): HeldMessage[] {
	if (result.outcome === "queued") return held.filter((message) => message.id !== id);
	const change: Partial<HeldMessage> =
		result.outcome === "delivered"
			? { state: "delivered", turnId: result.turnId }
			: { state: result.outcome === "not_delivered" ? "failed" : "unknown", reason: result.reason };
	return held.map((message) => (message.id === id ? { ...message, ...change } : message));
}

/**
 * Create the setup over its ports.
 * @param ports What it reaches for.
 * @returns The setup.
 */
function createAgentSetup(ports: AgentSetupPorts): AgentSetup {
	let held: HeldMessage[] = [];
	let talk: AgentSetupSnapshot["talk"] = "idle";
	let failure: string | null = null;
	let talkFailure: string | null = null;
	let signInAsked = false;
	let linking = false;
	// A create Codex accepted whose link has not reached the snapshot yet: a
	// second create now would make a second workhorse.
	let created = false;
	let delivering = false;
	let tab: AuthTab | null = null;
	let narration: string | null = null;
	let sequence = 0;
	const listeners = new Set<() => void>();

	/**
	 * Whether anything waits on a step.
	 * @returns True when a message or Talk waits.
	 */
	function waiting(): boolean {
		return talk === "waiting" || held.some((message) => message.state === "waiting");
	}

	/**
	 * The snapshot as things stand.
	 * @returns The snapshot.
	 */
	function snapshotNow(): AgentSetupSnapshot {
		const phase = agentPhase(ports.transport.state());
		const readyStep = phase.kind === "ready" && phase.linked ? null : STEP_BY_PHASE[phase.kind];
		return Object.freeze({
			phase,
			held: [...held],
			talk,
			step: waiting() ? readyStep : null,
			failure,
			talkFailure,
		});
	}

	let published = snapshotNow();

	/** Publish the snapshot to every listener. */
	function publish(): void {
		published = snapshotNow();
		for (const listener of listeners) listener();
	}

	/** Deliver the oldest waiting message, one at a time, then look again. */
	async function deliverNext(): Promise<void> {
		const next = held.find((message) => message.state === "waiting");
		if (next === undefined || delivering) return;
		delivering = true;
		held = held.map((message) =>
			message.id === next.id ? { ...message, state: "sending" } : message,
		);
		publish();
		try {
			held = settleDelivery(held, next.id, await ports.submit(next.text, next.queue));
		} catch (error) {
			held = settleDelivery(held, next.id, { outcome: "outcome_unknown", reason: words(error) });
		}
		delivering = false;
		pump();
	}

	/** Start voice once a conversation exists. */
	async function startTalk(): Promise<void> {
		if (talk !== "waiting") return;
		talk = "starting";
		publish();
		try {
			await ports.startVoice(narration);
		} catch (error) {
			talkFailure = words(error);
		}
		talk = "idle";
		publish();
	}

	/**
	 * Fail everything waiting, with a reason the person can act on.
	 * @param reason Why.
	 */
	function failWaiting(reason: string): void {
		held = held.map((message) =>
			message.state === "waiting" ? { ...message, state: "failed", reason } : message,
		);
		if (talk !== "waiting") return;
		talk = "idle";
		talkFailure = reason;
	}

	/** Create the conversation once, and look again when it settles. */
	async function link(): Promise<void> {
		if (linking || created) return;
		linking = true;
		publish();
		const result = await ports.createConversation();
		linking = false;
		created = result.ok;
		failure = result.ok ? null : result.reason;
		if (!result.ok) failWaiting(result.reason);
		pump();
	}

	/**
	 * Start a sign-in, once, for held work.
	 * @param login The provider.
	 */
	async function askSignIn(login: ThreadLinkLoginParams): Promise<void> {
		if (signInAsked) return;
		signInAsked = true;
		const result = await ports.signIn(login);
		if (result.ok) return;
		failure = result.reason;
		tab?.close();
		tab = null;
		signInAsked = false;
		publish();
	}

	/**
	 * Point the gesture's tab at the provider's page once Codex names it.
	 * @param authUrl The page, or null while Codex has not named it.
	 */
	function showProvider(authUrl: string | null): void {
		if (authUrl === null || tab === null) return;
		tab.navigate(authUrl);
		tab = null;
	}

	/**
	 * The one step a phase allows for held work.
	 * @param phase The phase.
	 */
	function advance(phase: AgentPhase): void {
		if (phase.kind === "signed_out") void askSignIn({ type: "chatgpt" });
		else if (phase.kind === "signing_in") showProvider(phase.authUrl);
		else if (phase.kind === "unavailable") failWaiting(phase.reason);
		else if (phase.kind === "ready") proceed(phase.linked);
	}

	/**
	 * With the agent ready: create the conversation, or deliver.
	 * @param linked Whether a conversation exists.
	 */
	function proceed(linked: boolean): void {
		if (!linked) {
			void link();
			return;
		}
		void deliverNext();
		void startTalk();
	}

	/** Carry held work one step further, as far as the phase allows. */
	function pump(): void {
		const state = ports.transport.state();
		held = held.filter(
			(message) => message.state !== "delivered" || !shownInTimeline(state, message),
		);
		const phase = agentPhase(state);
		if (phase.kind === "ready" && phase.linked) created = false;
		if (waiting()) advance(phase);
		if (phase.kind !== "signed_out" && phase.kind !== "signing_in") signInAsked = false;
		publish();
	}

	/**
	 * Keep the gesture's tab for a sign-in the held work is about to need.
	 * @param gestureTab The tab, if the gesture opened one.
	 */
	function keepTab(gestureTab: AuthTab | undefined): void {
		if (gestureTab === undefined) return;
		tab?.close();
		tab = gestureTab;
	}

	/**
	 * Listen for new snapshots.
	 * @param listener Called after each change.
	 * @returns Stops listening.
	 */
	function subscribe(listener: () => void): () => void {
		listeners.add(listener);
		return () => listeners.delete(listener);
	}

	/**
	 * Send a message, setting up whatever is missing first.
	 * @param text The message.
	 * @param options Whether to queue it, and a gesture's tab.
	 */
	function send(text: string, options: SendOptions = {}): void {
		sequence += 1;
		keepTab(options.tab);
		failure = null;
		const message: HeldMessage = {
			id: `held-${sequence}`,
			text,
			queue: options.queue === true,
			state: "waiting",
			reason: null,
			turnId: null,
		};
		held = [...held, message];
		pump();
	}

	/**
	 * Start voice, setting up whatever is missing first.
	 * @param options A walkthrough to narrate, and a gesture's tab for a sign-in.
	 */
	function startVoice(options: TalkOptions = {}): void {
		keepTab(options.tab);
		failure = null;
		talkFailure = null;
		if (talk !== "idle") return;
		narration = options.walkthrough ?? null;
		talk = "waiting";
		pump();
	}

	/**
	 * Sign in.
	 * @param login The provider.
	 * @param gestureTab A gesture's tab, for the provider's page.
	 */
	function signIn(login: ThreadLinkLoginParams, gestureTab?: AuthTab): void {
		keepTab(gestureTab);
		failure = null;
		signInAsked = false;
		void askSignIn(login);
		publish();
	}

	/** Cancel the pending sign-in, and whatever waited on it. */
	function cancelSignIn(): void {
		const phase = agentPhase(ports.transport.state());
		if (phase.kind !== "signing_in") return;
		void ports.cancelSignIn(phase.loginId);
		failWaiting("Sign-in was cancelled.");
		publish();
	}

	/**
	 * Send a failed message again.
	 * @param id The message.
	 */
	function retry(id: string): void {
		held = held.map((message) =>
			message.id === id ? { ...message, state: "waiting", reason: null, turnId: null } : message,
		);
		pump();
	}

	/**
	 * Drop a held message.
	 * @param id The message.
	 * @returns Its text.
	 */
	function discard(id: string): string | null {
		const message = held.find((entry) => entry.id === id);
		held = held.filter((entry) => entry.id !== id);
		publish();
		return message?.text ?? null;
	}

	/** Start a new conversation for this canvas, replacing the current one. */
	function newConversation(): void {
		failure = null;
		created = false;
		void link();
	}

	/**
	 * Listen to the transport.
	 * @returns Stops listening.
	 */
	function connect(): () => void {
		const unsubscribe = ports.transport.subscribe(pump);
		pump();
		return unsubscribe;
	}

	/**
	 * The current snapshot.
	 * @returns The snapshot.
	 */
	function snapshot(): AgentSetupSnapshot {
		return published;
	}

	return {
		subscribe,
		snapshot,
		send,
		talk: startVoice,
		signIn,
		cancelSignIn,
		newConversation,
		retry,
		discard,
		connect,
	};
}

export {
	createAgentSetup,
	type AgentSetup,
	type AgentSetupPorts,
	type AgentSetupSnapshot,
	type AuthTab,
	type HeldMessage,
	type HeldState,
	type SendOptions,
	type SetupStep,
	type TalkOptions,
	type SetupStepResult,
};
