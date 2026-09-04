import type { SessionThreadItem, SessionTurn } from "../../../../runtime/codex-session/index.js";
import type { IdentityAuthorities } from "../../../../shared/codex-workbench-identity/index.js";

type Item<Type extends SessionThreadItem["type"]> = Extract<SessionThreadItem, { type: Type }>;
type ItemInput<Type extends SessionThreadItem["type"]> = Omit<Item<Type>, "id">;

const id = (authorities: IdentityAuthorities, raw: string) =>
	authorities.identity.decoder.adoptItemId(raw);

export function userMessageItem(
	authorities: IdentityAuthorities,
	raw: string,
	value: ItemInput<"userMessage">,
) {
	return { ...value, id: id(authorities, raw) } satisfies Item<"userMessage">;
}

export function agentMessageItem(
	authorities: IdentityAuthorities,
	raw: string,
	value: ItemInput<"agentMessage">,
) {
	return { ...value, id: id(authorities, raw) } satisfies Item<"agentMessage">;
}

export function mcpToolCallItem(
	authorities: IdentityAuthorities,
	raw: string,
	value: ItemInput<"mcpToolCall">,
) {
	return { ...value, id: id(authorities, raw) } satisfies Item<"mcpToolCall">;
}

export function dynamicToolCallItem(
	authorities: IdentityAuthorities,
	raw: string,
	value: ItemInput<"dynamicToolCall">,
) {
	return { ...value, id: id(authorities, raw) } satisfies Item<"dynamicToolCall">;
}

export function commandExecutionItem(
	authorities: IdentityAuthorities,
	raw: string,
	value: ItemInput<"commandExecution">,
) {
	return { ...value, id: id(authorities, raw) } satisfies Item<"commandExecution">;
}

export function fileChangeItem(
	authorities: IdentityAuthorities,
	raw: string,
	value: ItemInput<"fileChange">,
) {
	return { ...value, id: id(authorities, raw) } satisfies Item<"fileChange">;
}

export function reasoningItem(
	authorities: IdentityAuthorities,
	raw: string,
	value: ItemInput<"reasoning">,
) {
	return { ...value, id: id(authorities, raw) } satisfies Item<"reasoning">;
}

export function planItem(authorities: IdentityAuthorities, raw: string, value: ItemInput<"plan">) {
	return { ...value, id: id(authorities, raw) } satisfies Item<"plan">;
}

export function turnFixture(
	authorities: IdentityAuthorities,
	raw: string,
	items: readonly SessionThreadItem[],
	status: SessionTurn["status"] = "completed",
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
	} satisfies SessionTurn;
}
