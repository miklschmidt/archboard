// Nothing to set up before talking to the agent. A message sent, or Talk
// pressed, while the agent is not ready is held here and carried through
// whatever is missing, in order: sign in to Archboard's own Codex (the
// provider page opens from the person's gesture), wait for Codex to start,
// create the conversation — an explicit create that starts its coordinator and
// then its workhorse (ADR 0019), never an adoption — and only then deliver it. Each held message is visible where it
// waits and says what it waits on; a failure stays on the message with the
// reason, and nothing is retried behind the person's back.

import type { BrowserVoicePresentation } from "#shared/schemas/voice-presentation.ts";
import type { LoginId } from "@archboard/codex-app-server/identity";
import type { WorkbenchComposerSubmissionResult } from "#ui/state/composer/contract.ts";
import type { ThreadLinkLoginParams } from "#ui/state/thread-link/transport-port.ts";
import type { BrowserWorkbenchState } from "@archboard/agent-workbench/browser";

import {
	arrivedAfterAll,
	promptsIn,
	settleDelivery,
	shownInTimeline,
	type HeldMessage,
} from "#ui/state/agent-setup/held.ts";
import { agentPhase, type AgentPhase } from "#ui/rules/agent-setup/phase.ts";
import { sameSnapshot } from "#ui/state/agent-setup/snapshot.ts";
import {
	signInAfter,
	signInEnded,
	tabFate,
	type SignInProgress,
} from "#ui/state/agent-setup/sign-in.ts";

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
	/** Create a new conversation for this tab. */
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
	 * @param narration The walkthrough to narrate and whether it is recorded, or null for a
	 * conversation.
	 */
	readonly startVoice: (narration: BrowserVoicePresentation | null) => Promise<void>;
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
	/** The narration is a recording a page paces itself (TASK-304), in this language (TASK-380). */
	readonly recording?: BrowserVoicePresentation["recording"];
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
	/** Start a new conversation for this tab. */
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
 * What a Talk narrates, if anything.
 * @param options How voice was asked for.
 * @returns The walkthrough and, for a recording, its language, or null for a conversation.
 */
function narrationOf(options: TalkOptions): BrowserVoicePresentation | null {
	if (options.walkthrough === undefined) return null;
	return options.recording === undefined
		? { walkthrough: options.walkthrough }
		: { walkthrough: options.walkthrough, recording: options.recording };
}

/**
 * Words for anything thrown.
 * @param error What was thrown.
 * @returns Its message.
 */
function words(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
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
	let signIn: SignInProgress = "none";
	// Moves on with every change of `signIn`, so an ask whose sign-in has
	// moved on cannot end it with a late refusal.
	let signInRevision = 0;
	let linking = false;
	// A create Codex accepted whose link has not reached the snapshot yet: a
	// second create now would make a second workhorse.
	let created = false;
	let delivering = false;
	let tab: AuthTab | null = null;
	let narration: BrowserVoicePresentation | null = null;
	let sequence = 0;
	// The prompts the timeline showed when each message was sent, by message id.
	const promptsBefore = new Map<string, ReadonlySet<string>>();
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

	/**
	 * Publish the snapshot to every listener, when it says something new. The
	 * transport publishes with every piece of a reply, and nearly none of them
	 * moves the setup: telling the listeners anyway drew the application's root
	 * again for each one (TASK-385.03).
	 */
	function publish(): void {
		const next = snapshotNow();
		if (sameSnapshot(published, next)) return;
		published = next;
		for (const listener of listeners) listener();
	}

	/**
	 * Deliver the oldest waiting message, one at a time, then look again. A
	 * message that was refused or went unanswered holds back every later one
	 * until the person retries, edits or discards it, so nothing overtakes it.
	 */
	async function deliverNext(): Promise<void> {
		if (delivering) return;
		const next = held.find((message) => message.state !== "delivered");
		if (next?.state !== "waiting") return;
		delivering = true;
		const before = promptsIn(ports.transport.state()).map((prompt) => prompt.itemId);
		promptsBefore.set(next.id, new Set(before));
		held = held.map((message) =>
			message.id === next.id ? { ...message, state: "sending" } : message,
		);
		publish();
		let result: WorkbenchComposerSubmissionResult;
		try {
			result = await ports.submit(next.text, next.queue);
		} catch (error) {
			result = { outcome: "outcome_unknown", reason: words(error) };
		}
		// Read the held list only now: more may have been sent while this one was on its way.
		held = settleDelivery(held, next.id, result);
		if (result.outcome !== "outcome_unknown") promptsBefore.delete(next.id);
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
	 * Start a sign-in. One that cannot start fails what waited on it, and
	 * nothing asks again until the person's next gesture.
	 * @param login The provider.
	 */
	async function askSignIn(login: ThreadLinkLoginParams): Promise<void> {
		moveSignIn("asked");
		const asked = signInRevision;
		const result = await ports.signIn(login);
		if (result.ok || asked !== signInRevision) return;
		moveSignIn("ended");
		failure = result.reason;
		failWaiting(result.reason);
		pump();
	}

	/**
	 * Follow a sign-in through the phases: one that goes back to signed out
	 * fails what waited on it with Codex's reason, instead of asking again.
	 * @param phase The phase.
	 */
	function followSignIn(phase: AgentPhase): void {
		const next = signInAfter(phase, signIn);
		if (next === "ended" && signIn === "pending") failWaiting(signInEnded(phase));
		moveSignIn(next);
	}

	/**
	 * Move the sign-in on.
	 * @param next Where it stands now.
	 */
	function moveSignIn(next: SignInProgress): void {
		if (next === signIn && next !== "asked") return;
		signIn = next;
		signInRevision += 1;
	}

	/**
	 * Point the gesture's tab at the provider's page once Codex names it, and
	 * close it once no sign-in is on its way to naming one.
	 * @param phase The phase.
	 */
	function pointTab(phase: AgentPhase): void {
		if (tab === null) return;
		const fate = tabFate(phase, signIn);
		if (fate.kind === "keep") return;
		if (fate.kind === "show") tab.navigate(fate.url);
		else tab.close();
		tab = null;
	}

	/**
	 * The one step a phase allows for held work.
	 * @param phase The phase.
	 */
	function advance(phase: AgentPhase): void {
		if (phase.kind === "signed_out" && signIn === "none") void askSignIn({ type: "chatgpt" });
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

	/**
	 * Whether the conversation shows a held message already.
	 * @param state The transport state.
	 * @param message The message.
	 * @returns True when it no longer needs holding.
	 */
	function shown(state: BrowserWorkbenchState, message: HeldMessage): boolean {
		if (message.state === "delivered") return shownInTimeline(state, message);
		if (message.state !== "unknown") return false;
		return arrivedAfterAll(state, message, promptsBefore.get(message.id));
	}

	/**
	 * Stop holding the messages the conversation shows.
	 * @param state The transport state.
	 */
	function prune(state: BrowserWorkbenchState): void {
		held = held.filter((message) => {
			if (!shown(state, message)) return true;
			promptsBefore.delete(message.id);
			return false;
		});
	}

	/** Carry held work one step further, as far as the phase allows. */
	function pump(): void {
		const state = ports.transport.state();
		prune(state);
		const phase = agentPhase(state);
		if (phase.kind === "ready" && phase.linked) created = false;
		followSignIn(phase);
		if (waiting()) advance(phase);
		pointTab(phase);
		publish();
	}

	/**
	 * A gesture by the person: keep the tab it opened for a sign-in the held
	 * work is about to need, and let a sign-in that ended be asked for again.
	 * @param gestureTab The tab, if the gesture opened one.
	 */
	function gesture(gestureTab: AuthTab | undefined): void {
		failure = null;
		if (signIn === "ended") moveSignIn("none");
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
		gesture(options.tab);
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
		gesture(options.tab);
		talkFailure = null;
		if (talk === "idle") {
			narration = narrationOf(options);
			talk = "waiting";
		}
		pump();
	}

	/**
	 * Sign in.
	 * @param login The provider.
	 * @param gestureTab A gesture's tab, for the provider's page.
	 */
	function startSignIn(login: ThreadLinkLoginParams, gestureTab?: AuthTab): void {
		gesture(gestureTab);
		void askSignIn(login);
		pump();
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
		promptsBefore.delete(id);
		pump();
		return message?.text ?? null;
	}

	/** Start a new conversation for this tab, replacing the current one. */
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
		signIn: startSignIn,
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
	type SendOptions,
	type SetupStep,
	type TalkOptions,
	type SetupStepResult,
};
