import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, expect, test } from "bun:test";
import { createElement } from "react";

GlobalRegistrator.register();
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { ArchitectureReadError } = await import("#ui/clients/architecture-model/queries.ts");
const { ModelUnanswered } = await import("#ui/components/architecture-model/ModelUnanswered.tsx");
const { ModelDraftContext } = await import("#ui/state/architecture-model/draft.ts");

const drafts: string[] = [];
const fill = drafts.push.bind(drafts);

/**
 * Show what a refused read leaves.
 * @param code The refusal.
 * @returns The element in the page.
 */
async function refused(code: string): Promise<HTMLElement> {
	const error = new ArchitectureReadError({ success: false, code, error: code } as never);
	const host = document.body.appendChild(document.createElement("div"));
	const problem = { code, message: code };
	const unanswered = createElement(ModelUnanswered, { error, problem });
	const shown = createElement(ModelDraftContext.Provider, { value: fill }, unanswered);
	await act(async () => createRoot(host).render(shown));
	return host;
}

afterEach(() => {
	document.body.replaceChildren();
	drafts.length = 0;
});

afterAll(() => GlobalRegistrator.unregister());

test.each([
	["LEGACY_AUTHORITY", "model-migration-required"],
	["MODEL_NOT_FOUND", "model-absent"],
])("%s is a state of the repository, and its action fills the composer", async (code, slot) => {
	const host = await refused(code);
	expect(host.querySelector(`[data-slot="${slot}"]`)).not.toBeNull();
	expect(host.querySelector('[data-slot="model-error"]')).toBeNull();
	await act(async () => host.querySelector("button")?.click());
	expect(drafts).toHaveLength(1);
});

test("any other refusal stays a failure", async () => {
	const host = await refused("MODEL_INVALID");
	expect(host.querySelector('[data-slot="model-error"]')).not.toBeNull();
	expect(host.querySelector('[data-slot="model-state-ask"]')).toBeNull();
});
