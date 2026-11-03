// What a pane does with each message on its socket.
//
// A semantic pane hears about its model rather than receiving it. The model is
// a file the server reads and draws; the pane holds no copy, so nothing here
// applies content, merges anything or decides what the model becomes (ADR
// 0023). Five kinds of news: which model this pane is on and in which
// repository's vault, what an agent is doing, what the shell should do about the
// layout, which step of a walkthrough somebody narrating it asked for, and that
// a checkout was chosen somewhere.

import {
	PanePresentRequestSchema,
	ArchitecturePaneReadingSchema,
} from "@archboard/model/pane-context";
import { paneAddressOf } from "#ui/rules/canvas/reading/address.ts";
import type {
	AgentActivityEntry,
	LegacyIdentity,
	WebSocketMessage,
} from "#ui/rules/pane-session/session-types.ts";
import type { z } from "zod";

type PanePresentRequest = z.infer<typeof PanePresentRequestSchema>;

/** Canonical navigation resolved by the shared runtime before it reaches a pane. */
interface PaneModelRequest {
	readonly reading: z.infer<typeof ArchitecturePaneReadingSchema> & { model: string };
	readonly repository: string | null;
}

/** Where the server says a pane is: a vault, and the repository it is listed under. */
interface PanePlace {
	readonly vault: string;
	readonly repository: string | null;
}

/** Everything a message handler may read or do. */
interface MessageContext {
	readonly clientId: string;
	readonly paneKey: () => string | null;
	/**
	 * The vault the pane is in: news on its socket is about this vault.
	 * @returns The vault.
	 */
	readonly vault: () => string;
	/**
	 * This pane is on a model: the one the server addressed to it.
	 * @param key The model key, or null when the server named none.
	 * @param identity Its identity, when the server sent one.
	 * @param place The vault the pane is in now, when the server said.
	 */
	readonly adoptModel: (
		key: string | null | undefined,
		identity: LegacyIdentity | null | undefined,
		place: PanePlace | null,
	) => void;
	readonly publishStatus: () => void;
	readonly onLayoutRequest: ((request: "open" | "close") => void) | undefined;
	readonly onPresentRequest: ((request: PanePresentRequest) => void) | undefined;
	readonly onModelRequest?: ((request: PaneModelRequest) => void) | undefined;
	readonly onAgentActivity:
		| ((vault: string, activity: readonly AgentActivityEntry[]) => void)
		| undefined;
	readonly onRepositoriesChanged: (() => void) | undefined;
	readonly onExplanationsChanged: (() => void) | undefined;
}

type Handler = (context: MessageContext, data: WebSocketMessage) => void;

/**
 * The server points this pane at a model: on connect, and whenever a `browser
 * show` moves it.
 * @param context The pane.
 * @param data The message.
 */
function panePlaced(context: MessageContext, data: WebSocketMessage): void {
	const place =
		typeof data.vault === "string"
			? { vault: data.vault, repository: data.repository ?? null }
			: null;
	context.adoptModel(data.paneKey, data.identity, place);
}

/**
 * A canonical arrival updates its place and delegates display intent to the router.
 * @param context The addressed pane session.
 * @param data The runtime-resolved reading.
 */
function paneModel(context: MessageContext, data: WebSocketMessage): void {
	if (typeof data.model !== "string" || typeof data.vault !== "string") return;
	const parsed = ArchitecturePaneReadingSchema.safeParse(data.reading);
	if (!parsed.success) return;
	const repository = data.repository ?? null;
	context.adoptModel(null, null, { vault: data.vault, repository });
	context.onModelRequest?.({ reading: { ...parsed.data, model: data.model }, repository });
}

/**
 * Whether a model's news is about the model this pane is showing.
 *
 * Compared by the model and not by the whole address: the news names the
 * aggregate, because every variant is in the one document and a write to any of
 * them is a new version of all of them. A pane reading a proposal has to redraw
 * when what it proposes to change moves under it.
 * @param context The pane.
 * @param said The model the news names.
 * @returns True when it is about this pane's model.
 */
function aboutThisModel(context: MessageContext, said: string): boolean {
	const mine = context.paneKey();
	return mine !== null && paneAddressOf(said)?.model === paneAddressOf(mine)?.model;
}

/**
 * Which models an agent is working on in one vault (ADR 0022). Keyless and
 * sent to every client, naming its vault; the shell replaces that vault's whole
 * map, so two panes hearing the same snapshot say the same thing twice, harmlessly.
 * @param context The pane.
 * @param data The message.
 */
function agentActivity(context: MessageContext, data: WebSocketMessage): void {
	if (typeof data.vault === "string" && Array.isArray(data.activity)) {
		context.onAgentActivity?.(data.vault, data.activity);
	}
}

/**
 * The server asks for another pane. Layout is the shell's; sent up untouched.
 * @param context The pane.
 */
function paneOpen(context: MessageContext): void {
	context.onLayoutRequest?.("open");
}

/**
 * The server asks for this pane to go.
 * @param context The pane.
 */
function paneClose(context: MessageContext): void {
	context.onLayoutRequest?.("close");
}

/**
 * A checkout was chosen somewhere, so the repositories are read again.
 * @param context The pane.
 */
function repositoriesChanged(context: MessageContext): void {
	context.onRepositoriesChanged?.();
}

/**
 * The server asks this pane to go to a step of a walkthrough, or to leave the
 * presentation (TASK-251). Where the pane is in a walkthrough is the pane's own,
 * so the request goes up to whoever draws the model; a request that does not
 * read as one is dropped, and the server hears nothing arrived.
 * @param context The pane.
 * @param data The message.
 */
function panePresent(context: MessageContext, data: WebSocketMessage): void {
	const request = PanePresentRequestSchema.safeParse(data);
	if (request.success) {
		context.onPresentRequest?.(request.data);
	}
}

const HANDLERS: Readonly<Record<string, Handler>> = {
	pane_model: paneModel,
	pane_place: panePlaced,
	agent_activity: agentActivity,
	pane_open: paneOpen,
	pane_close: paneClose,
	pane_present: panePresent,
	repositories_changed: repositoriesChanged,
	/**
	 * Refresh the tab answer through the existing query owner.
	 * @param context The current pane callbacks.
	 */
	architecture_explanations_changed: (context): void => {
		context.onExplanationsChanged?.();
	},
};

/**
 * Whether a message is about this pane.
 *
 * A model's news names the model it is about.
 * @param context The pane.
 * @param data The message.
 * @returns True when the message is ours to act on.
 */
function addressesThisPane(context: MessageContext, data: WebSocketMessage): boolean {
	if (data.type === "pane_place" || data.type === "pane_model") {
		return true;
	}
	const said = data.paneKey;
	return typeof said === "string" ? aboutThisModel(context, said) : true;
}

/**
 * Act on one socket message.
 * @param context The pane.
 * @param data The message.
 */
function handleSocketMessage(context: MessageContext, data: WebSocketMessage): void {
	if (addressesThisPane(context, data)) {
		HANDLERS[data.type]?.(context, data);
	}
}

export { handleSocketMessage, type MessageContext, type PanePlace, type PaneModelRequest };
