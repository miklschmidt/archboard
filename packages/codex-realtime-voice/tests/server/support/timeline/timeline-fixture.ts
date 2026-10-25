import type { SessionThreadItem, SessionTurn } from "@archboard/codex-app-server/session";
import type { ThreadLinkSnapshot } from "#runtime/rules/thread-link/contract.ts";
import type { IdentityAuthorities, ThreadId } from "@archboard/codex-app-server/identity";

type Item<Type extends SessionThreadItem["type"]> = Extract<SessionThreadItem, { type: Type }>;
type ItemInput<Type extends SessionThreadItem["type"]> = Omit<Item<Type>, "id">;

const id = (authorities: IdentityAuthorities, raw: string) =>
	authorities.identity.decoder.adoptItemId(raw);

function userMessageItem(
	authorities: IdentityAuthorities,
	raw: string,
	value: ItemInput<"userMessage">,
) {
	return { ...value, id: id(authorities, raw) } satisfies Item<"userMessage">;
}

function agentMessageItem(
	authorities: IdentityAuthorities,
	raw: string,
	value: ItemInput<"agentMessage">,
) {
	return { ...value, id: id(authorities, raw) } satisfies Item<"agentMessage">;
}

function mcpToolCallItem(
	authorities: IdentityAuthorities,
	raw: string,
	value: ItemInput<"mcpToolCall">,
) {
	return { ...value, id: id(authorities, raw) } satisfies Item<"mcpToolCall">;
}

function dynamicToolCallItem(
	authorities: IdentityAuthorities,
	raw: string,
	value: ItemInput<"dynamicToolCall">,
) {
	return { ...value, id: id(authorities, raw) } satisfies Item<"dynamicToolCall">;
}

function commandExecutionItem(
	authorities: IdentityAuthorities,
	raw: string,
	value: ItemInput<"commandExecution">,
) {
	return { ...value, id: id(authorities, raw) } satisfies Item<"commandExecution">;
}

function fileChangeItem(
	authorities: IdentityAuthorities,
	raw: string,
	value: ItemInput<"fileChange">,
) {
	return { ...value, id: id(authorities, raw) } satisfies Item<"fileChange">;
}

function reasoningItem(
	authorities: IdentityAuthorities,
	raw: string,
	value: ItemInput<"reasoning">,
) {
	return { ...value, id: id(authorities, raw) } satisfies Item<"reasoning">;
}

function planItem(authorities: IdentityAuthorities, raw: string, value: ItemInput<"plan">) {
	return { ...value, id: id(authorities, raw) } satisfies Item<"plan">;
}

function webSearchItem(
	authorities: IdentityAuthorities,
	raw: string,
	value: ItemInput<"webSearch">,
) {
	return { ...value, id: id(authorities, raw) } satisfies Item<"webSearch">;
}

function contextCompactionItem(authorities: IdentityAuthorities, raw: string) {
	return {
		type: "contextCompaction",
		id: id(authorities, raw),
	} satisfies Item<"contextCompaction">;
}

function turnFixture(
	authorities: IdentityAuthorities,
	raw: string,
	items: readonly SessionThreadItem[],
	status: SessionTurn["status"] = "completed",
	overrides: Partial<Pick<SessionTurn, "error" | "startedAt" | "completedAt" | "durationMs">> = {},
): SessionTurn {
	return {
		id: authorities.identity.decoder.adoptTurnId(raw),
		items,
		itemsView: "full",
		status,
		error: null,
		startedAt: 1,
		completedAt: 2,
		durationMs: 1,
		...overrides,
	} satisfies SessionTurn;
}

/** An executable link from a chat to one thread, on the authorities' current child. */
function executableLink(authorities: IdentityAuthorities, threadId: ThreadId): ThreadLinkSnapshot {
	return {
		kind: "thread_link",
		state: "executable",
		childId: authorities.identity.validator.childId,
		epoch: authorities.identity.validator.epoch,
		threadId,
		source: "appServer",
		status: "idle",
		loaded: true,
		canAcceptDirectInput: true,
		reason: null,
	};
}

/** Let the owner's chained history reads settle. */
async function flush(): Promise<void> {
	for (let index = 0; index < 8; index += 1) {
		await Promise.resolve();
	}
}

export {
	executableLink,
	flush,
	userMessageItem,
	agentMessageItem,
	mcpToolCallItem,
	dynamicToolCallItem,
	commandExecutionItem,
	fileChangeItem,
	reasoningItem,
	planItem,
	webSearchItem,
	contextCompactionItem,
	turnFixture,
};
