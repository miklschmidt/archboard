import { createIdentityAuthority } from "../../../shared/codex-workbench-identity/index.ts";
import {
	createSemanticContextPublisher,
	type SemanticContextInput,
	type SettledChangeSourceEvent,
} from "../index.ts";

function identities() {
	const authority = createIdentityAuthority();
	return {
		child: authority.validator.childId,
		epoch: authority.validator.epoch,
		thread: (raw: string) => authority.decoder.adoptThreadId(raw),
		turn: (raw: string) => authority.decoder.adoptTurnId(raw),
		realtimeSession: authority.issuer.mintRealtimeSessionId(),
	};
}

type Identities = ReturnType<typeof identities>;

function context(
	ids: Identities,
	overrides: Partial<SemanticContextInput> = {},
): SemanticContextInput {
	return {
		repository: "archboard",
		child: { id: ids.child, epoch: ids.epoch },
		threadLink: { state: "executable", reason: null },
		workhorse: { threadId: ids.thread("workhorse"), turnId: ids.turn("turn-1") },
		coordinator: {
			threadId: ids.thread("coordinator"),
			realtimeSessionId: ids.realtimeSession,
		},
		board: { key: "payments", note: "boards/payments.excalidraw.md", version: 7 },
		pane: { paneId: "pane-a", focused: true },
		selection: ["element-b", "element-a"],
		claim: { holder: "agent", doing: "mapping the board" },
		doing: "mapping the board",
		cursor: { feedId: "feed-1", sequence: 3 },
		description: "Payments board: checkout, ledger, and settlement boundaries.",
		ambiguity: [],
		...overrides,
	};
}

function change(
	now: number,
	overrides: Partial<SettledChangeSourceEvent> = {},
): SettledChangeSourceEvent {
	return {
		cursor: 3,
		board: "payments",
		at: new Date(now).toISOString(),
		origin: "human",
		significance: "structural",
		text: "A human settled a structural board change.",
		...overrides,
	};
}

type RegistrationFailure = "feed" | "focus" | "selection";

interface HarnessOptions {
	readonly registrationFailure?: RegistrationFailure;
	readonly cleanupFailures?: readonly RegistrationFailure[];
}

function sourceHarness(options: HarnessOptions = {}) {
	const ids = identities();
	const state = {
		now: 1_700_000_000_000,
		freshContext: context(ids),
		changeContext: context(ids),
		freshReads: 0,
		changeReads: 0,
		feedSubscriptions: 0,
		feedUnsubscriptions: 0,
		focusSubscriptions: 0,
		focusUnsubscriptions: 0,
		selectionSubscriptions: 0,
		selectionUnsubscriptions: 0,
	};
	const feedListeners = new Set<(event: SettledChangeSourceEvent) => void>();
	const focusListeners = new Set<(input: SemanticContextInput) => void>();
	const selectionListeners = new Set<(input: SemanticContextInput) => void>();
	const cleanupShouldFail = (port: RegistrationFailure) =>
		options.cleanupFailures?.includes(port) === true;
	const feed = {
		onChange(listener: (event: SettledChangeSourceEvent) => void) {
			state.feedSubscriptions++;
			if (options.registrationFailure === "feed") {
				throw new Error("feed registration failed");
			}
			feedListeners.add(listener);
			let active = true;
			return () => {
				if (!active) {
					return;
				}
				active = false;
				state.feedUnsubscriptions++;
				feedListeners.delete(listener);
				if (cleanupShouldFail("feed")) {
					throw new Error("feed cleanup failed");
				}
			};
		},
	};
	const pane = {
		onFocus(listener: (input: SemanticContextInput) => void) {
			state.focusSubscriptions++;
			if (options.registrationFailure === "focus") {
				throw new Error("focus registration failed");
			}
			focusListeners.add(listener);
			let active = true;
			return () => {
				if (!active) {
					return;
				}
				active = false;
				state.focusUnsubscriptions++;
				focusListeners.delete(listener);
				if (cleanupShouldFail("focus")) {
					throw new Error("focus cleanup failed");
				}
			};
		},
		onSelection(listener: (input: SemanticContextInput) => void) {
			state.selectionSubscriptions++;
			if (options.registrationFailure === "selection") {
				throw new Error("selection registration failed");
			}
			selectionListeners.add(listener);
			let active = true;
			return () => {
				if (!active) {
					return;
				}
				active = false;
				state.selectionUnsubscriptions++;
				selectionListeners.delete(listener);
				if (cleanupShouldFail("selection")) {
					throw new Error("selection cleanup failed");
				}
			};
		},
	};
	const createPublisher = (feedId = "feed-1") =>
		createSemanticContextPublisher({
			feed,
			feedId,
			pane,
			fresh: {
				read: () => {
					state.freshReads++;
					return state.freshContext;
				},
			},
			contextForChange: () => {
				state.changeReads++;
				return state.changeContext;
			},
			now: () => state.now,
		});
	return {
		ids,
		state,
		createPublisher,
		activeSources: () => ({
			feed: feedListeners.size,
			focus: focusListeners.size,
			selection: selectionListeners.size,
		}),
		emitFeed: (event: SettledChangeSourceEvent) => {
			for (const listener of feedListeners) {
				listener(event);
			}
		},
		emitFocus: (input: SemanticContextInput) => {
			for (const listener of focusListeners) {
				listener(input);
			}
		},
		emitSelection: (input: SemanticContextInput) => {
			for (const listener of selectionListeners) {
				listener(input);
			}
		},
	};
}

function harness() {
	const source = sourceHarness();
	return { ...source, publisher: source.createPublisher() };
}

function utf8(value: string): number {
	return new TextEncoder().encode(value).byteLength;
}

export {
	identities,
	type Identities,
	context,
	change,
	type RegistrationFailure,
	type HarnessOptions,
	sourceHarness,
	harness,
	utf8,
};
