// The semantic events the callbacks owners publish: one board, one pane, one settled change, as
// the harness in support.ts names them.

import {
	createSemanticContextPublisher,
	type PaneFocusEvent,
	type PaneSelectionEvent,
	type SemanticContextInput,
	type SemanticContextPublisher,
	type SettledChangeSourceEvent,
	type SettledSemanticChangeEvent,
} from "#runtime/api/semantic-context.ts";
import type { Identities } from "#tests/runtime/services/coordinator-callbacks/support.ts";

function semanticInput(ids: Identities, active: boolean): SemanticContextInput {
	return {
		repository: "archboard",
		child: { id: ids.child, epoch: ids.epoch },
		threadLink: { state: "executable", reason: null },
		workhorse: { threadId: ids.workhorse, turnId: ids.turn },
		coordinator: {
			threadId: ids.coordinator,
			realtimeSessionId: active ? ids.wireSessionId : null,
		},
		board: {
			key: "architecture",
			name: "Architecture",
			vault: "/work/.archboard/vault",
			file: "boards/architecture.semantic.json",
			version: 7,
		},
		pane: { paneId: "pane-a", focused: true },
		architecture: {
			variant: { id: "v1", name: "Current", lifecycle: "current", against: null },
			view: null,
			selection: {
				count: 2,
				subjects: [
					{ kind: "node" as const, id: "element-a", name: "Gateway" },
					{ kind: "edge" as const, id: "element-b", name: null },
				],
			},
			differences: null,
			reconciliation: { required: false, count: 0, blockedBy: null, issues: [] },
		},
		doing: "mapping",
		cursor: { feedId: "feed-1", sequence: 7 },
		description: "Architecture board",
	};
}

interface SemanticSources {
	readonly publisher: SemanticContextPublisher;
	readonly change: SettledSemanticChangeEvent;
	readonly focus: PaneFocusEvent;
	readonly selection: PaneSelectionEvent;
	readonly dispose: () => void;
}

function semanticSources(ids: Identities, active: boolean): SemanticSources {
	let change: SettledSemanticChangeEvent | null = null;
	const listeners = new Set<(event: SettledChangeSourceEvent) => void>();
	const input = semanticInput(ids, active);
	const publisher = createSemanticContextPublisher({
		feed: {
			onChange(listener) {
				listeners.add(listener);
				return () => listeners.delete(listener);
			},
		},
		feedId: "feed-1",
		fresh: { read: () => input },
		contextForChange: () => input,
		now: () => 1_700_000_000_000,
	});
	publisher.subscribeSettledChange((event) => {
		change = event;
	});
	const focus = publisher.publishPaneFocus(input);
	const selection = publisher.publishPaneSelection({
		...input,
		architecture: {
			...input.architecture,
			selection: {
				count: 1,
				subjects: [{ kind: "node" as const, id: "element-c", name: "Ledger" }],
			},
		},
	});
	for (const listener of listeners) {
		listener({
			cursor: 7,
			vault: "/work/.archboard/vault",
			board: "architecture",
			at: "2023-11-14T22:13:20.000Z",
			origin: "human",
			significance: "structural",
			text: "A structural change.",
		});
	}
	if (change === null) {
		throw new Error("semantic fixture failed");
	}
	return { publisher, change, focus, selection, dispose: () => publisher.dispose() };
}

export { type SemanticSources, semanticInput, semanticSources };
