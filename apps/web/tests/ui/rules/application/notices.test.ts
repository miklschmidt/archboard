import { expect, test } from "bun:test";

import {
	NOTICE_ACTIONS,
	modelErrorNotice,
	codeTargetShellNotice,
	staleFrontendNotice,
	unreachableModelsNotice,
	withNotice,
	withoutNotice,
} from "#ui/rules/application/notices.ts";

test("a notice with the same id replaces its predecessor in place", () => {
	const first = modelErrorNotice("A", "the model could not be drawn");
	const second = modelErrorNotice("A", "the model has no variant called proposed");
	const stale = staleFrontendNotice("rebuilt");
	const stack = withNotice(withNotice([first], stale), second);
	expect(stack.map((notice) => notice.id)).toEqual(["pane-error:A", "stale-frontend"]);
	expect(stack[0]?.description).toContain("no variant called proposed");
	expect(withoutNotice(stack, "pane-error:A").map((notice) => notice.id)).toEqual([
		"stale-frontend",
	]);
});

test("raising the same words or dismissing an absent id keeps the stack's identity", () => {
	const stack = withNotice([], modelErrorNotice("A", "the model could not be drawn"));
	expect(withNotice(stack, modelErrorNotice("A", "the model could not be drawn"))).toBe(stack);
	expect(withoutNotice(stack, "pane-error:B")).toBe(stack);
	expect(withNotice(stack, modelErrorNotice("A", "something else"))).not.toBe(stack);
});

test("code target notices carry the typed actions through and stale builds offer a reload", () => {
	const notice = codeTargetShellNotice({
		kind: "error",
		message: "No checkout",
		actions: [{ kind: "settings", label: "Opener settings" }],
	});
	expect(notice.tone).toBe("destructive");
	expect(notice.actions).toEqual([{ kind: "settings", label: "Opener settings" }]);
	expect(staleFrontendNotice("old").actions).toEqual([
		{ kind: "select", id: NOTICE_ACTIONS.reloadFrontend, label: "Reload" },
	]);
});

test("an address that named models nobody could open names them, one or many", () => {
	const one = unreachableModelsNotice(["nowhere"]);
	expect(one.title).toBe("nowhere could not be opened");
	expect(one.description).toContain("Model navigation");
	const several = unreachableModelsNotice(["nowhere", "elsewhere"]);
	expect(several.title).toBe("Some models could not be opened");
	expect(several.description).toContain("nowhere, elsewhere");
});
