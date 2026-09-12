import { expect, test } from "bun:test";

import {
	NOTICE_ACTIONS,
	boardErrorNotice,
	codeTargetShellNotice,
	staleFrontendNotice,
	unreachableBoardsNotice,
	withNotice,
	withoutNotice,
} from "@/ui/application/notices";

test("a notice with the same id replaces its predecessor in place", () => {
	const first = boardErrorNotice("A", "the board could not be drawn");
	const second = boardErrorNotice("A", "the board has no variant called proposed");
	const stale = staleFrontendNotice("rebuilt");
	const stack = withNotice(withNotice([first], stale), second);
	expect(stack.map((notice) => notice.id)).toEqual(["board-error:A", "stale-frontend"]);
	expect(stack[0]?.description).toContain("no variant called proposed");
	expect(withoutNotice(stack, "board-error:A").map((notice) => notice.id)).toEqual([
		"stale-frontend",
	]);
});

test("raising the same words or dismissing an absent id keeps the stack's identity", () => {
	const stack = withNotice([], boardErrorNotice("A", "the board could not be drawn"));
	expect(withNotice(stack, boardErrorNotice("A", "the board could not be drawn"))).toBe(stack);
	expect(withoutNotice(stack, "board-error:B")).toBe(stack);
	expect(withNotice(stack, boardErrorNotice("A", "something else"))).not.toBe(stack);
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

test("an address that named boards nobody could open names them, one or many", () => {
	const one = unreachableBoardsNotice(["nowhere"]);
	expect(one.title).toBe("nowhere could not be opened");
	expect(one.description).toContain("Board navigation");
	const several = unreachableBoardsNotice(["nowhere", "elsewhere"]);
	expect(several.title).toBe("Some boards could not be opened");
	expect(several.description).toContain("nowhere, elsewhere");
});
