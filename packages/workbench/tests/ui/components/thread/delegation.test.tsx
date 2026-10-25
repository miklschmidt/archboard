import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { act, createElement } from "react";
import { AssistantRuntimeProvider, useExternalStoreRuntime } from "@assistant-ui/react";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { createRoot, type Root } from "react-dom/client";

import { createIdentityAuthorities } from "@archboard/codex-app-server/identity";
import { toThreadMessageLike } from "#ui/rules/runtime/messages.ts";
import { mergeConversation } from "@archboard/codex-realtime-voice/controllers";
import { type ConversationTurn } from "@archboard/codex-realtime-voice/controllers";
import { Conversation } from "#ui/components/thread/Conversation.tsx";

const { decoder } = createIdentityAuthorities().identity;

let root: Root;
/** The elements the page was asked to scroll into view, in order. */
let scrolled: Element[] = [];

beforeAll(() => {
	GlobalRegistrator.register();
	Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
	Element.prototype.scrollIntoView = scrollIntoView;
});
afterEach(() => {
	act(() => root.unmount());
	document.body.replaceChildren();
	scrolled = [];
});
afterAll(async () => {
	await GlobalRegistrator.unregister();
});

/**
 * Stand in for a scroll, which happy-dom cannot lay out: it records who was asked.
 */
function scrollIntoView(this: Element): void {
	scrolled.push(this);
}

/**
 * One turn, with a prompt and an answer.
 * @param owner Whose turn it is.
 * @param id Its id.
 * @param startedAtMs When it started.
 * @param delegatedBy The coordinator turn that delegated it.
 * @returns The turn.
 */
function turn(
	owner: ConversationTurn["owner"],
	id: string,
	startedAtMs: number,
	delegatedBy: string | null = null,
): ConversationTurn {
	const threadId = decoder.adoptThreadId(`thread-${owner}`);
	const turnId = decoder.adoptTurnId(id);
	return {
		id: `${threadId}/${turnId}`,
		owner,
		threadId,
		turnId,
		outcome: "completed",
		items: [
			{ media: "prompt", itemId: decoder.adoptItemId(`${id}-prompt`), text: `Prompt of ${id}` },
			{ media: "text", itemId: decoder.adoptItemId(`${id}-answer`), text: `Answer of ${id}` },
		],
		startedAtMs,
		completedAtMs: startedAtMs + 1000,
		durationMs: 1000,
		error: null,
		plan: null,
		delegatedBy:
			delegatedBy === null ? null : { turnId: decoder.adoptTurnId(delegatedBy), shown: false },
	};
}

/**
 * Nothing is sent through the conversation's runtime.
 * @returns Nothing sent.
 */
function nothingSent(): Promise<void> {
	return Promise.resolve();
}

/**
 * The conversation over a runtime that holds these turns.
 * @param props The merged turns.
 * @param props.turns The turns.
 * @returns The conversation.
 */
function Shown(props: {
	readonly turns: readonly ConversationTurn[];
}): ReturnType<typeof createElement> {
	const runtime = useExternalStoreRuntime<ConversationTurn>({
		messages: props.turns,
		convertMessage: toThreadMessageLike,
		onNew: nothingSent,
	});
	return createElement(
		AssistantRuntimeProvider,
		{ runtime },
		createElement(Conversation, null, null),
	);
}

/**
 * Show the workhorse's turns and the coordinator's as the conversation does.
 * @param workhorse The workhorse's turns.
 * @param coordinator The coordinator's turns.
 */
async function mount(
	workhorse: readonly ConversationTurn[],
	coordinator: readonly ConversationTurn[],
): Promise<void> {
	const container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	const turns = mergeConversation(workhorse, coordinator);
	await act(async () => root.render(createElement(Shown, { turns })));
}

/**
 * The turns on screen.
 * @returns Each turn's element, in order.
 */
function turnsOnScreen(): HTMLElement[] {
	return [...document.querySelectorAll<HTMLElement>('[data-slot="turn"]')];
}

test("the voice coordinator's turns are named, and the workhorse's are not", async () => {
	await mount([turn("workhorse", "w1", 2000)], [turn("coordinator", "c1", 1000)]);
	const shown = turnsOnScreen();
	expect(shown.map((element) => element.dataset["owner"])).toEqual(["coordinator", "workhorse"]);
	expect(
		shown.map((element) => element.querySelector('[data-slot="voice-turn-head"]') !== null),
	).toEqual([true, false]);
	expect(shown[0]?.dataset["voiceTurn"]).toBe(decoder.adoptTurnId("c1"));
	expect(shown[1]?.dataset["voiceTurn"]).toBeUndefined();
});

test("work the coordinator delegated points to the turn that delegated it, which it brings into view", async () => {
	await mount(
		[turn("workhorse", "w1", 2000, "c1"), turn("workhorse", "w2", 3000)],
		[turn("coordinator", "c1", 1000)],
	);
	const lines = document.querySelectorAll('[data-slot="delegated-from"]');
	expect(lines).toHaveLength(1);
	const button = lines[0]?.querySelector("button");
	expect(button).not.toBeNull();
	act(() => button?.click());
	expect(scrolled).toHaveLength(1);
	expect(scrolled[0]).toBe(turnsOnScreen()[0]);
	expect(turnsOnScreen()[0]?.dataset["owner"]).toBe("coordinator");
});

test("work delegated by a turn that is no longer shown still says so, with nothing to press", async () => {
	await mount([turn("workhorse", "w1", 2000, "gone")], [turn("coordinator", "c1", 1000)]);
	const line = document.querySelector('[data-slot="delegated-from"]');
	expect(line).not.toBeNull();
	expect(line?.querySelector("button")).toBeNull();
});
