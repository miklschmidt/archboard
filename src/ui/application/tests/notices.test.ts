import { expect, test } from "bun:test";

import {
	NOTICE_ACTIONS,
	codeTargetShellNotice,
	holdNotice,
	staleFrontendNotice,
	withNotice,
	withoutNotice,
} from "@/ui/application/notices";

test("a notice with the same id replaces its predecessor in place", () => {
	const first = holdNotice("A", "Checkout", 1);
	const second = holdNotice("A", "Checkout", 2);
	const stale = staleFrontendNotice("rebuilt");
	const stack = withNotice(withNotice([first], stale), second);
	expect(stack.map((notice) => notice.id)).toEqual(["hold:A", "stale-frontend"]);
	expect(stack[0]?.description).toContain("2 change(s)");
	expect(withoutNotice(stack, "hold:A").map((notice) => notice.id)).toEqual(["stale-frontend"]);
});

test("raising the same words or dismissing an absent id keeps the stack's identity", () => {
	const stack = withNotice([], holdNotice("A", "Checkout", 1));
	expect(withNotice(stack, holdNotice("A", "Checkout", 1))).toBe(stack);
	expect(withoutNotice(stack, "elsewhere:A")).toBe(stack);
	expect(withNotice(stack, holdNotice("A", "Checkout", 2))).not.toBe(stack);
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
