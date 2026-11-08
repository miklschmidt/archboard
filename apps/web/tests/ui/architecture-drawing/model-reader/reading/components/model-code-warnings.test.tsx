// The count of warnings of the model: a quiet one, as the foot of the right panel shows it, draws
// nothing while the pass found no warning to walk through, and About always shows the count.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, expect, test } from "bun:test";
import { createElement, type ComponentProps } from "react";

GlobalRegistrator.register();
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
const { cleanup, render } = await import("@testing-library/react");
const { ModelCodeWarnings } =
	await import("#ui/architecture-drawing/model-reader/reading/components/ModelCodeFindings.tsx");

type Reading = NonNullable<ComponentProps<typeof ModelCodeWarnings>["reading"]>;

const COUNT = "[data-slot='code-warning-count']";

/**
 * A pass over the shop with one finding of each severity named.
 * @param severities The severity of each finding.
 * @returns The pass, as the server keeps it.
 */
function pass(...severities: Reading["findings"][number]["severity"][]): Reading {
	return {
		model: "Shop",
		state: "Current",
		revision: { digest: "a".repeat(64), files: [] },
		checkedAt: "2026-11-01T12:00:00.000Z",
		findings: severities.map((severity) => ({
			code: "BINDING_SYMBOL_MISSING",
			severity,
			file: "modules/gateway.json",
			subject: { kind: "node", id: "Shop#Gateway", name: "Gateway" },
			message: "The binding of Gateway names a symbol that its file does not define.",
		})),
	};
}

/** A count that selects nothing: these tests read the count alone. */
function selectNothing(): void {}

/**
 * Show the count.
 * @param reading What the pass found.
 * @param quiet Whether the count says nothing for a pass with no warning.
 * @returns The count's button, or null when none stands.
 */
function counted(reading: Reading, quiet: boolean): HTMLButtonElement | null {
	render(createElement(ModelCodeWarnings, { reading, onSelect: selectNothing, quiet }));
	return document.querySelector<HTMLButtonElement>(COUNT);
}

afterEach(cleanup);
afterAll(async () => {
	await Bun.sleep(1);
	await GlobalRegistrator.unregister();
});

test("a quiet count draws nothing for a pass with no warning, and counts the warnings that it has", () => {
	expect(counted(pass("information"), true)).toBeNull();
	cleanup();
	expect(counted(pass(), true)).toBeNull();
	cleanup();
	const walked = counted(pass("information", "warning", "warning"), true);
	expect(walked?.getAttribute("data-count")).toBe("2");
	expect(walked?.disabled).toBe(false);
});

test("the count of About stays for a pass with no warning, and offers nothing to walk through", () => {
	const none = counted(pass("information"), false);
	expect(none?.getAttribute("data-count")).toBe("0");
	expect(none?.disabled).toBe(true);
});
