// Which layout engine this browser draws with (TASK-348).
//
// Engines sit behind one seam (ADR 0040): a person switches between them and
// every pane draws again with the one chosen. The choice is presentation,
// owned by this browser like the theme, remembered in its storage and never
// written anywhere else (ADR 0023). A remembered engine that no longer exists
// reads as the default.

import {
	DEFAULT_LAYOUT_ENGINE,
	LayoutEngineSchema,
	type LayoutEngineName,
} from "@archboard/board/render-reply";

/** Where the choice is remembered. */
const LAYOUT_ENGINE_KEY = "archboard.layout-engine";

/** What each engine is, as the control offers it. */
const LAYOUT_ENGINES: readonly { readonly name: LayoutEngineName; readonly label: string }[] = [
	{ name: "blocks", label: "Blocks" },
	{ name: "track", label: "Tracks" },
];

/**
 * The choice this browser remembers, or the default.
 * @returns The engine.
 */
function remembered(): LayoutEngineName {
	try {
		const parsed = LayoutEngineSchema.safeParse(globalThis.localStorage.getItem(LAYOUT_ENGINE_KEY));
		return parsed.success ? parsed.data : DEFAULT_LAYOUT_ENGINE;
	} catch {
		return DEFAULT_LAYOUT_ENGINE;
	}
}

let current: LayoutEngineName | undefined;
const listeners = new Set<() => void>();

/**
 * The engine pictures are drawn with now.
 * @returns The engine.
 */
function layoutEngineNow(): LayoutEngineName {
	current ??= remembered();
	return current;
}

/**
 * Draw with another engine from now on, and remember it.
 * @param engine The engine.
 */
function chooseLayoutEngine(engine: LayoutEngineName): void {
	if (engine === layoutEngineNow()) return;
	current = engine;
	try {
		globalThis.localStorage.setItem(LAYOUT_ENGINE_KEY, engine);
	} catch {
		// Storage can be unavailable; the choice still holds for this page.
	}
	for (const listener of listeners) listener();
}

/**
 * Be told when the engine changes.
 * @param listener Called after each change.
 * @returns Stops telling.
 */
function onLayoutEngineChange(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export { LAYOUT_ENGINES, chooseLayoutEngine, layoutEngineNow, onLayoutEngineChange };
