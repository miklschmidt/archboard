// The options every command may share, stated once.
//
// Each of these rides on every request one invocation makes rather than on one
// of them, which is why routing takes them out of argv before a command's own
// parser sees them. That is also why they are described here rather than in
// any one command: a command says which of them it reads, help shows exactly
// those, and one it does not read is refused instead of accepted in silence.

import type { OptionParameter, SharedOptionKey } from "@/cli/command-contract/contract";

/** One shared option, as help and the parser both describe it. */
type SharedOption = Omit<OptionParameter, "kind" | "key" | "route" | "hidden"> & {
	key: SharedOptionKey;
};

const SHARED_OPTIONS: Readonly<Record<SharedOptionKey, SharedOption>> = {
	url: {
		key: "url",
		spellings: ["--url"],
		value: "required",
		placeholder: "url",
		description: "The canvas to talk to; overrides EXPRESS_SERVER_URL",
		default: "http://127.0.0.1:3000",
	},
	board: {
		key: "board",
		spellings: ["--board"],
		value: "required",
		placeholder: "key",
		required: true,
		description: "The board the command is about; there is no default board (ADR 0020)",
	},
	doing: {
		key: "doing",
		spellings: ["--doing"],
		value: "required",
		placeholder: "line",
		required: true,
		description:
			"One present-tense line saying what this write does, shown on every pane holding the board " +
			"and never written to it",
	},
	"expect-version": {
		key: "expect-version",
		spellings: ["--expect-version"],
		value: "required",
		placeholder: "n",
		required: true,
		description:
			"The board version this write was read against; refused if the board has moved past it",
	},
	"as-session": {
		key: "as-session",
		spellings: ["--as-session"],
		value: "required",
		placeholder: "thread",
		description: "The agent session writing, so it can skip the board news it wrote itself",
	},
};

/** Every shared option, in the order help lists them. */
const SHARED_OPTION_KEYS: readonly SharedOptionKey[] = [
	"url",
	"board",
	"doing",
	"expect-version",
	"as-session",
];

/**
 * The shared options one command reads, as option parameters help can list.
 * @param keys The keys the command declares.
 * @returns The options, in the shared order.
 */
function sharedOptionsFor(keys: readonly SharedOptionKey[]): OptionParameter[] {
	return SHARED_OPTION_KEYS.filter((key) => keys.includes(key)).map((key) => ({
		kind: "option",
		...SHARED_OPTIONS[key],
	}));
}

/**
 * The shared options a command does not read, among those an invocation stated.
 * @param declared The keys the command declares.
 * @param stated The keys the invocation gave a value for.
 * @returns The first spelling of each refused option, in the shared order.
 */
function inapplicableSharedOptions(
	declared: readonly SharedOptionKey[],
	stated: readonly SharedOptionKey[],
): string[] {
	return SHARED_OPTION_KEYS.filter((key) => stated.includes(key) && !declared.includes(key)).map(
		(key) => SHARED_OPTIONS[key].spellings[0],
	);
}

export {
	SHARED_OPTIONS,
	SHARED_OPTION_KEYS,
	type SharedOption,
	inapplicableSharedOptions,
	sharedOptionsFor,
};
