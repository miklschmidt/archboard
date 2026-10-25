// What the server-wide agent setup speaks through: the focused pane's
// thread-link controller and composer, the voice session, which is kept on the
// pane it started in only once it started and let go once it ends, and a tab
// opened from the person's own gesture for a provider's sign-in page, so a
// popup blocker lets it through.

import type {
	AgentSetup,
	AgentSetupPorts,
	AuthTab,
	SetupStepResult,
} from "@archboard/workbench/agent";
import type { AgentFocus } from "#ui/state/application/agent-focus.ts";
import type { VoiceSession, VoiceSessionStatus } from "@archboard/workbench/voice";
import type { ConversationControllers } from "@archboard/codex-realtime-voice/controllers";

/** The thread link controller of a pane. */
type ThreadLinkController = ConversationControllers["threadLink"];
/** How one thread-link action settled. */
type ThreadLinkActionCompletion = Awaited<ReturnType<ThreadLinkController["create"]>>;

/** Why a step reports nothing of its own: a later action on the pane replaced it. */
const REPLACED = "A later action on this pane replaced this one before it settled.";

/**
 * How the thread-link controller settled one action, as a setup step: its
 * own settlement, never whatever the controller shows by the time it is read.
 * @param threadLink The controller.
 * @param completion The action's completion.
 * @returns The step result.
 */
function threadLinkStep(
	threadLink: Pick<ThreadLinkController, "snapshot">,
	completion: ThreadLinkActionCompletion,
): SetupStepResult {
	const snapshot = threadLink.snapshot();
	if (completion.state === "ignored" || snapshot.revision !== completion.revision) {
		return { ok: false, reason: REPLACED };
	}
	if (snapshot.state === "succeeded") return { ok: true };
	return { ok: false, reason: "announcement" in snapshot ? snapshot.announcement : REPLACED };
}

/** Why a step cannot be taken while no pane is connected. */
const NO_PANE_WORDS = "No pane is connected to the Archboard server.";
const NO_PANE: SetupStepResult = { ok: false, reason: NO_PANE_WORDS };

/** Keep voice on one pane, or let it follow the focused pane again with null. */
type PinVoice = (paneId: string | null) => void;

/** Statuses a start reaches once voice is live or on its way to live. */
const STARTED: ReadonlySet<VoiceSessionStatus> = new Set([
	"requesting_permission",
	"negotiating",
	"listening",
	"muted",
	"processing",
	"agent_speaking",
	"recovering",
]);

/**
 * Start voice in the pane voice runs for, and keep it there once it started.
 * A start that does not reach a live or connecting status is a failure, in
 * the words of the session's view: it may be blocked with no failure at all.
 * @param focus The voice as focused now.
 * @param focus.voice The voice owner, or null.
 * @param pinVoice Keep voice on one pane, or release it.
 * @returns The voice port.
 */
function voicePort(
	focus: {
		readonly voice: () => {
			readonly paneId: string;
			readonly session: Pick<VoiceSession, "start">;
		} | null;
	},
	pinVoice: PinVoice,
): AgentSetupPorts["startVoice"] {
	return async (narration) => {
		const voice = focus.voice();
		if (voice === null) throw new Error(NO_PANE_WORDS);
		const view = await voice.session.start(narration);
		if (!STARTED.has(view.status)) {
			pinVoice(null);
			throw new Error(view.failure?.message ?? view.detail);
		}
		pinVoice(voice.paneId);
	};
}

/**
 * Release voice's pane once its session is over, however it ended.
 * @param session The pinned pane's voice session.
 * @param release Let voice follow the focused pane again.
 * @returns Stop watching.
 */
function releaseWhenVoiceEnds(
	session: Pick<VoiceSession, "view" | "subscribe">,
	release: () => void,
): () => void {
	/** Release once the session is neither live nor on its way to live. */
	const check = (): void => {
		if (!STARTED.has(session.view().status)) release();
	};
	check();
	return session.subscribe(check);
}

/**
 * The ports the server-wide agent setup speaks through: the focused pane's
 * transport and controllers, whichever pane that is when a step is taken.
 * @param focus The agent focus.
 * @param pinVoice Keep voice on the pane it started in, or release it.
 * @returns The ports.
 */
function agentSetupPorts(focus: AgentFocus, pinVoice: PinVoice): AgentSetupPorts {
	return {
		transport: focus,
		/**
		 * Create this tab's conversation.
		 * @returns How it settled.
		 */
		createConversation: async () => {
			const owners = focus.owners();
			if (owners === null) return NO_PANE;
			return threadLinkStep(owners.threadLink, await owners.threadLink.create());
		},
		/**
		 * Start a sign-in.
		 * @param login The provider.
		 * @returns How it settled.
		 */
		signIn: async (login) => {
			const owners = focus.owners();
			if (owners === null) return NO_PANE;
			return threadLinkStep(owners.threadLink, await owners.threadLink.login(login));
		},
		/**
		 * Cancel a sign-in.
		 * @param loginId The sign-in.
		 * @returns How it settled.
		 */
		cancelSignIn: async (loginId) => {
			const owners = focus.owners();
			if (owners === null) return NO_PANE;
			return threadLinkStep(owners.threadLink, await owners.threadLink.cancelLogin(loginId));
		},
		/**
		 * Deliver one message: queued when asked; otherwise the composer
		 * starts a turn or steers the running one, as the link says.
		 * @param text The message.
		 * @param wantsQueue Whether to queue it.
		 * @returns The composer's result.
		 */
		submit: (text, wantsQueue) => {
			const owners = focus.owners();
			if (owners === null)
				return Promise.resolve({ outcome: "not_delivered", reason: NO_PANE_WORDS });
			return owners.composer.submit({ text, delivery: wantsQueue ? "queue" : "auto" });
		},
		startVoice: voicePort(focus, pinVoice),
	};
}

/**
 * Open a blank tab from the person's gesture, so a popup blocker lets it
 * through, to point at the provider's sign-in page once Codex names it.
 * @returns The tab, or undefined when the browser refused one.
 */
function openAuthTab(): AuthTab | undefined {
	const opened = window.open("about:blank", "_blank");
	if (opened === null) return undefined;
	opened.opener = null;
	return {
		/**
		 * Point the tab at the sign-in page.
		 * @param url The page.
		 */
		navigate: (url) => {
			opened.location.href = url;
		},
		/** Close the tab. */
		close: () => {
			opened.close();
		},
	};
}

/**
 * A tab for the provider's page, when the gesture is about to need one.
 * @param setup The agent setup.
 * @returns The tab, or undefined while nobody needs to sign in.
 */
function gestureTab(setup: Pick<AgentSetup, "snapshot">): AuthTab | undefined {
	return setup.snapshot().phase.kind === "signed_out" ? openAuthTab() : undefined;
}

/**
 * Start voice to narrate one walkthrough, from the person's gesture, so a
 * sign-in it needs gets its tab like any other Talk.
 * @param setup The agent setup.
 * @param walkthrough The walkthrough's id.
 */
function narrate(setup: Pick<AgentSetup, "snapshot" | "talk">, walkthrough: string): void {
	setup.talk({ walkthrough, tab: gestureTab(setup) });
}

export {
	agentSetupPorts,
	gestureTab,
	narrate,
	openAuthTab,
	releaseWhenVoiceEnds,
	threadLinkStep,
	voicePort,
};
