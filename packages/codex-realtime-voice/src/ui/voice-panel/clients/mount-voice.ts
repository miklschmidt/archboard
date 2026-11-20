// A working voice panel over the voice client, in plain DOM: sign-in, voice, the transcript, the
// workhorse's messages, a message field, the two stops and command approvals. It uses native
// controls and the system's light and dark colors, carries no stylesheet of its own, announces
// its status politely and its failures at once, and takes its words from a replaceable set.

import { createVoiceClient } from "#ui/voice-client/clients/voice-client.ts";
import type {
	VoiceApproval,
	VoiceClient,
	VoiceClientSnapshot,
} from "#ui/voice-client/state/contract.ts";
import { ENGLISH, statusOf, type VoicePanelText } from "#ui/voice-panel/rules/text.ts";

const LIVE = new Set([
	"requesting_permission",
	"negotiating",
	"listening",
	"muted",
	"processing",
	"speaking",
]);

/** The elements the panel updates on each publication. */
interface PanelParts {
	readonly status: HTMLElement;
	readonly failure: HTMLElement;
	readonly failureText: HTMLElement;
	readonly refresh: HTMLButtonElement;
	readonly signIn: HTMLElement;
	readonly signInButton: HTMLButtonElement;
	readonly continueSignIn: HTMLAnchorElement;
	readonly signedIn: HTMLButtonElement;
	readonly conversation: HTMLElement;
	readonly startVoice: HTMLButtonElement;
	readonly stopVoice: HTMLButtonElement;
	readonly transcript: HTMLElement;
	readonly work: HTMLElement;
	readonly message: HTMLTextAreaElement;
	readonly send: HTMLButtonElement;
	readonly stopWork: HTMLButtonElement;
	readonly approvals: HTMLElement;
}

/**
 * Make an element with its text.
 * @param tag The element's tag.
 * @param text Its text, if any.
 * @returns The element.
 */
function element<Tag extends keyof HTMLElementTagNameMap>(
	tag: Tag,
	text = "",
): HTMLElementTagNameMap[Tag] {
	const made = document.createElement(tag);
	made.textContent = text;
	return made;
}

/**
 * Make a native button that runs an action.
 * @param text Its label.
 * @param action What it runs.
 * @returns The button.
 */
function button(text: string, action: () => unknown): HTMLButtonElement {
	const made = element("button", text);
	made.type = "button";
	made.addEventListener("click", () => void action());
	return made;
}

/**
 * Lay an element out with inline styles, keeping its display for {@link reveal}.
 * @param made The element.
 * @param css Its inline styles.
 * @returns The element.
 */
function layout<Made extends HTMLElement>(made: Made, css: string): Made {
	made.style.cssText = css;
	made.dataset["display"] = made.style.display;
	return made;
}

/**
 * Show or hide an element. An inline `display` outranks the `hidden` attribute, so both change.
 * @param target The element.
 * @param shown Whether it shows.
 */
function reveal(target: HTMLElement, shown: boolean): void {
	target.hidden = !shown;
	target.style.display = shown ? (target.dataset["display"] ?? "") : "none";
}

/**
 * Lay out a group of elements in a row that wraps.
 * @param children The elements.
 * @returns The row.
 */
function row(...children: HTMLElement[]): HTMLElement {
	const made = layout(element("div"), "display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center");
	made.append(...children);
	return made;
}

/**
 * Send the message field's text to the workhorse, and empty the field once it was delivered,
 * unless the person typed on meanwhile.
 * @param client The client.
 * @param message The message field.
 */
async function sendMessage(client: VoiceClient, message: HTMLTextAreaElement): Promise<void> {
	const sent = message.value;
	if ((await client.send(sent)) && message.value === sent) message.value = "";
}

/**
 * Build the panel's elements and wire their actions to the client.
 * @param client The client.
 * @param text The panel's words.
 * @returns The panel and the parts it updates.
 */
function build(client: VoiceClient, text: VoicePanelText) {
	const panel = element("section");
	panel.setAttribute("aria-label", text.panel);
	panel.style.cssText =
		"color-scheme:light dark;background:Field;color:FieldText;display:grid;gap:0.75rem;max-width:40rem;padding:1rem";
	const status = element("p");
	status.setAttribute("role", "status");
	const failureText = element("span");
	const refresh = button(text.refresh, () => client.refresh());
	const failure = row(failureText, refresh);
	failure.setAttribute("role", "alert");
	const continueSignIn = element("a", text.continueSignIn);
	continueSignIn.target = "_blank";
	continueSignIn.rel = "noreferrer";
	const signInButton = button(text.signIn, () => client.signIn());
	const signedIn = button(text.signedIn, () => client.refresh());
	const signIn = row(signInButton, continueSignIn, signedIn);
	const startVoice = button(text.startVoice, () => client.startVoice());
	const stopVoice = button(text.stopVoice, () => client.stopVoice());
	const transcript = element("ol");
	transcript.setAttribute("aria-label", text.transcript);
	const work = element("ol");
	work.setAttribute("aria-label", text.work);
	const message = element("textarea");
	message.rows = 3;
	message.style.cssText = "width:100%;box-sizing:border-box";
	const label = element("label", text.message);
	label.style.cssText = "display:grid;gap:0.25rem";
	label.append(message);
	const send = element("button", text.send);
	const stopWork = button(text.stopWork, () => client.stopWork());
	const form = element("form");
	form.style.cssText = "display:grid;gap:0.5rem";
	form.append(label, row(send, stopWork));
	form.addEventListener("submit", (event) => {
		event.preventDefault();
		void sendMessage(client, message);
	});
	const approvals = element("div");
	approvals.style.cssText = "display:grid;gap:0.75rem";
	const conversation = layout(element("div"), "display:grid;gap:0.75rem");
	conversation.append(row(startVoice, stopVoice), transcript, work, form, approvals);
	panel.append(status, failure, signIn, conversation);
	const parts: PanelParts = {
		status,
		failure,
		failureText,
		refresh,
		signIn,
		signInButton,
		continueSignIn,
		signedIn,
		conversation,
		startVoice,
		stopVoice,
		transcript,
		work,
		message,
		send,
		stopWork,
		approvals,
	};
	return { panel, parts };
}

/**
 * Replace a list's items when their source changed, and hide the list while it is empty.
 * @param list The list.
 * @param lines The text of each item.
 */
function fill(list: HTMLElement, lines: readonly string[]): void {
	reveal(list, lines.length > 0);
	const same =
		list.childElementCount === lines.length &&
		[...list.children].every((item, index) => item.textContent === lines[index]);
	if (!same) list.replaceChildren(...lines.map((line) => element("li", line)));
}

/**
 * The card of one pending approval: the command and a native button per decision, or a note for a
 * kind the panel does not answer.
 * @param client The client.
 * @param approval The approval.
 * @param text The panel's words.
 * @returns The card.
 */
function approvalCard(
	client: VoiceClient,
	approval: VoiceApproval,
	text: VoicePanelText,
): HTMLElement {
	const card = element("section");
	card.style.cssText = "display:grid;gap:0.5rem";
	if (approval.approvalKind !== "command_execution") {
		card.append(element("p", text.unanswerable(approval.approvalKind)));
		return card;
	}
	const command = element("pre", approval.command ?? "");
	command.style.cssText = "white-space:pre-wrap;margin:0";
	const decisions = approval.availableDecisions.flatMap((decision) =>
		typeof decision === "string"
			? [
					button(text.decision(decision), () =>
						client.answerApproval(approval, { approvalKind: "command_execution", decision }),
					),
				]
			: [],
	);
	card.setAttribute("aria-label", text.runCommand);
	card.append(element("p", text.runCommand), command, row(...decisions));
	return card;
}

type ServerState = NonNullable<VoiceClientSnapshot["server"]>;

/**
 * Show the status line and the failure of a state.
 * @param parts The panel's parts.
 * @param text The panel's words.
 * @param state The state.
 */
function showStatus(parts: PanelParts, text: VoicePanelText, state: VoiceClientSnapshot): void {
	const status = statusOf(state, text);
	if (parts.status.textContent !== status) parts.status.textContent = status;
	const problem = state.failure?.message ?? state.voice.problem;
	reveal(parts.failure, problem !== null);
	parts.failureText.textContent = problem ?? "";
	reveal(parts.refresh, state.failure?.uncertain === true);
}

/**
 * Show the sign-in of a signed-out account: the button, then the link and the confirmation while
 * a sign-in is pending.
 * @param parts The panel's parts.
 * @param login The account's sign-in.
 */
function showSignIn(parts: PanelParts, login: ServerState["login"]): void {
	const authUrl = login.state === "pending" ? login.authUrl : null;
	reveal(parts.signInButton, login.state !== "pending");
	reveal(parts.continueSignIn, authUrl !== null);
	if (authUrl !== null) parts.continueSignIn.href = authUrl;
	reveal(parts.signedIn, login.state === "pending");
}

/**
 * Show the voice, the transcript, the workhorse's messages and the controls of a signed-in state.
 * @param parts The panel's parts.
 * @param state The state.
 * @param server What the server published.
 */
function showConversation(
	parts: PanelParts,
	state: VoiceClientSnapshot,
	server: ServerState,
): void {
	const live = LIVE.has(state.voice.phase);
	parts.startVoice.disabled = state.busy || live || !state.voice.available;
	parts.stopVoice.disabled = !live;
	fill(
		parts.transcript,
		server.voice.transcript.map((line) => `${line.speaker}: ${line.text}`),
	);
	const turns = server.timeline?.turns ?? [];
	fill(
		parts.work,
		turns.flatMap((turn) =>
			turn.items.flatMap((item) =>
				item.media === "prompt" || item.media === "text" ? [item.text] : [],
			),
		),
	);
	const running = turns.some((turn) => turn.status === "inProgress");
	parts.send.disabled = state.busy || running;
	parts.stopWork.disabled = !running;
}

/**
 * Show one state of the client.
 * @param client The client.
 * @param parts The panel's parts.
 * @param text The panel's words.
 * @param state The state.
 * @param shown The approvals the panel shows now, replaced when the state's approvals change.
 * @returns The approvals the panel shows after this state.
 */
function show(
	client: VoiceClient,
	parts: PanelParts,
	text: VoicePanelText,
	state: VoiceClientSnapshot,
	shown: readonly VoiceApproval[] | null,
): readonly VoiceApproval[] | null {
	showStatus(parts, text, state);
	const server = state.connection === "connected" ? state.server : null;
	const ready = server?.account.state === "ready";
	reveal(parts.signIn, server !== null && !ready);
	reveal(parts.conversation, ready);
	if (server === null) return shown;
	if (!ready) {
		showSignIn(parts, server.login);
		return shown;
	}
	showConversation(parts, state, server);
	return showApprovals(client, parts, text, server.approvals, shown);
}

/**
 * Show the pending approvals of a state, when they are not the ones shown already.
 * @param client The client.
 * @param parts The panel's parts.
 * @param text The panel's words.
 * @param approvals The state's approvals.
 * @param shown The approvals the panel shows now.
 * @returns The approvals the panel shows after this state.
 */
function showApprovals(
	client: VoiceClient,
	parts: PanelParts,
	text: VoicePanelText,
	approvals: readonly VoiceApproval[],
	shown: readonly VoiceApproval[] | null,
): readonly VoiceApproval[] {
	if (shown === approvals) return shown;
	const pending = approvals.filter((approval) => approval.lifecycle.state === "pending");
	parts.approvals.replaceChildren(
		...pending.map((approval) => approvalCard(client, approval, text)),
	);
	return approvals;
}

/**
 * Draw the panel of a client in an element, and follow its state.
 * @param host The element the panel is drawn in.
 * @param client The client.
 * @param text The panel's words.
 * @returns Removes the panel and stops following the client.
 */
function renderVoicePanel(host: Element, client: VoiceClient, text: VoicePanelText): () => void {
	const { panel, parts } = build(client, text);
	let shown: readonly VoiceApproval[] | null = null;
	/** Show the client's current state. */
	const update = () => {
		shown = show(client, parts, text, client.snapshot(), shown);
	};
	update();
	host.append(panel);
	const unsubscribe = client.subscribe(update);
	return () => {
		unsubscribe();
		panel.remove();
	};
}

/** How the panel is drawn. */
interface MountVoiceOptions {
	/** The chat the panel shows. Default: `main`. */
	readonly chatId?: string;
	/** Words that replace the panel's English ones. */
	readonly text?: Partial<VoicePanelText>;
}

/**
 * Draw a working voice panel in an element: the panel connects to the agent's socket, and keeps
 * reconnecting and following the page's `pagehide` and `pageshow` by itself.
 * @param host The element the panel is drawn in, such as `document.querySelector("main")`.
 * @param url The agent's socket URL, or its path, such as `/voice`.
 * @param options The chat and the words of the panel.
 * @returns Removes the panel and disposes its client.
 * @throws {TypeError} When there is no element to draw in.
 */
function mountVoice(
	host: Element | null,
	url: string,
	options: MountVoiceOptions = {},
): () => void {
	if (host === null) throw new TypeError("Give mountVoice an element to draw the voice panel in.");
	const client = createVoiceClient({
		url,
		...(options.chatId === undefined ? {} : { chatId: options.chatId }),
	});
	const remove = renderVoicePanel(host, client, { ...ENGLISH, ...options.text });
	return () => {
		remove();
		void client.dispose();
	};
}

export { mountVoice, renderVoicePanel, type MountVoiceOptions, type VoicePanelText };
