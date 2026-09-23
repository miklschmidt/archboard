// The agent surfaces' one view and one set of actions, over the canvas-wide
// agent setup, the focused pane's owners and the voice session. Everything the
// agent bar and the conversation panel show comes through `AgentView`;
// everything a person does there goes out through `AgentActions`.

import { useCallback, useMemo, useState, useSyncExternalStore, type RefObject } from "react";

import type { AuthTab } from "@/ui/agent-setup";
import { useVoiceView } from "@/ui/application/hooks/use-voice-view";
import type { WorkbenchHost } from "@/ui/application/hooks/use-workbench";
import type { ApprovalDecisions } from "@/ui/application/lib/workbench-owners";
import { subtitlePreference, useSubtitlesWanted } from "@/ui/voice-subtitles";
import type { AgentActions, AgentContext, AgentView } from "@/ui/workbench/contracts";
import type { DraftStore } from "@/ui/workbench";
import { useConversation, type Conversation } from "@/ui/workbench-runtime";

const NO_DECISIONS: ApprovalDecisions = Object.freeze({ busy: [], errors: {} });

/** What the agent hook reads beyond the workbench. */
interface AgentInputs {
	readonly host: WorkbenchHost;
	readonly draft: DraftStore;
	readonly composer: RefObject<HTMLTextAreaElement | null>;
	readonly context: AgentContext;
	readonly openPanel: () => void;
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
		navigate: (url) => {
			opened.location.href = url;
		},
		close: () => opened.close(),
	};
}

/**
 * Nothing to listen to without owners.
 * @returns How to stop listening.
 */
function subscribeToNothing(): () => void {
	return () => undefined;
}

/**
 * The approvals controller's decisions, or none while the pane has no owners.
 * @param host The workbench host.
 * @returns The decisions.
 */
function useApprovalDecisions(host: WorkbenchHost): ApprovalDecisions {
	const store = host.owners?.approvalDecisions ?? null;
	const read = useCallback(() => store?.getSnapshot() ?? NO_DECISIONS, [store]);
	return useSyncExternalStore(store?.subscribe ?? subscribeToNothing, read, read);
}

/**
 * When the running turn last reported anything new, so the bar can say it
 * has gone quiet.
 * @param conversation The conversation.
 * @returns The time of the last change, or null while nothing runs.
 */
function useLastProgress(conversation: Conversation): number | null {
	const running = conversation.turns.find((turn) => turn.outcome === "running");
	const signature = running === undefined ? null : `${running.turnId}:${running.items.length}:${JSON.stringify(running.items.at(-1) ?? null)}:${JSON.stringify(running.plan)}`;
	const [seen, setSeen] = useState<{ signature: string | null; at: number | null }>({ signature: null, at: null });
	if (seen.signature !== signature) {
		setSeen({ signature, at: signature === null ? null : Date.now() });
	}
	return seen.signature === signature ? seen.at : null;
}

/**
 * The agent's view and actions.
 * @param inputs The workbench, the draft, the composer, the context and the panel.
 * @returns The view and the actions.
 */
function useAgent(inputs: AgentInputs): { readonly view: AgentView; readonly actions: AgentActions } {
	const { host, draft, composer, context, openPanel } = inputs;
	const { setup, owners, voice } = host;
	const setupSnapshot = useSyncExternalStore(setup.subscribe, setup.snapshot, setup.snapshot);
	const transport = owners?.transport ?? null;
	const state = useSyncExternalStore(
		transport?.subscribe ?? subscribeToNothing,
		() => transport?.state() ?? null,
		() => transport?.state() ?? null,
	);
	const conversation = useConversation(transport);
	const voiceView = useVoiceView(voice, setupSnapshot);
	const decisions = useApprovalDecisions(host);
	const lastProgressAtMs = useLastProgress(conversation);
	const subtitles = useSubtitlesWanted();

	const view = useMemo<AgentView>(
		() => ({
			setup: setupSnapshot,
			snapshot: state?.snapshot ?? null,
			conversation,
			voice: voiceView,
			context,
			busyApprovals: decisions.busy,
			approvalErrors: decisions.errors,
			lastProgressAtMs,
			subtitles,
		}),
		[setupSnapshot, state, conversation, voiceView, context, decisions, lastProgressAtMs, subtitles],
	);

	const actions = useMemo<AgentActions>(() => {
		/**
		 * A tab for the provider's page, when the gesture is about to need one.
		 * @returns The tab, or undefined.
		 */
		const gestureTab = (): AuthTab | undefined =>
			setup.snapshot().phase.kind === "signed_out" ? openAuthTab() : undefined;
		return {
			send: (text, queue) => setup.send(text, { queue, tab: gestureTab() }),
			talk: () => setup.talk({ tab: gestureTab() }),
			mute: () => void voice?.session.mute(),
			unmute: () => void voice?.session.unmute(),
			endVoice: () => {
				void voice?.session.stop().then(host.releaseVoice);
			},
			toggleSubtitles: () => subtitlePreference.change(!subtitlePreference.wanted()),
			stop: () => {
				const running = conversation.turns.find((turn) => turn.outcome === "running");
				if (running !== undefined) void owners?.composer.interrupt(running.turnId);
			},
			signIn: (login) => setup.signIn(login, login.type === "chatgpt" ? openAuthTab() : undefined),
			cancelSignIn: () => setup.cancelSignIn(),
			signOut: () => void owners?.threadLink.logout(),
			newConversation: () => setup.newConversation(),
			retry: (id) => setup.retry(id),
			edit: (id) => {
				const text = setup.discard(id);
				if (text === null) return;
				draft.set(text);
				composer.current?.focus();
			},
			respondToApproval: (approval, choice) => owners?.approvals.panelActions.respondToApproval(approval, choice),
			respondToDynamicApproval: (approval, verdict) =>
				owners?.approvals.panelActions.respondToDynamicApproval(approval, verdict),
			queue: owners?.queue.panelActions ?? NO_QUEUE,
			openPanel,
		};
	}, [setup, voice, host.releaseVoice, conversation, owners, draft, composer, openPanel]);

	return { view, actions };
}

/** Queue actions while the pane has no owners: there is no queue to act on. */
const NO_QUEUE: AgentActions["queue"] = Object.freeze({
	moveUp: () => undefined,
	moveDown: () => undefined,
	remove: () => undefined,
	sendNow: () => undefined,
});

export { useAgent, type AgentInputs };
