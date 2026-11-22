// The engine this browser remembers: Lanes replaced Track (ADR 0096), so a remembered `track`
// reads as `lanes`; a name that never was an engine reads as the default.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, beforeAll, expect, test } from "bun:test";

const KEY = "archboard.layout-engine";
const MODULE = "#ui/architecture-drawing/canvas/picture/clients/layout-engine.ts";

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

/**
 * The engine a browser draws with once it remembers a value, read by a page that has just loaded.
 * @param saved What the browser's storage holds.
 * @returns The engine.
 */
async function engineRemembering(saved: string): Promise<string> {
	globalThis.localStorage.setItem(KEY, saved);
	const { layoutEngineNow } = await import(`${MODULE}?${saved}`);
	return layoutEngineNow();
}

test("a remembered engine is the one drawn with, and an old Track reads as Lanes", async () => {
	expect(await engineRemembering("lanes")).toBe("lanes");
	expect(await engineRemembering("track")).toBe("lanes");
	expect(await engineRemembering("graphviz")).toBe("blocks");
});
