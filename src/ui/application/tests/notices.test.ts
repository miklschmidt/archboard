import { expect, test } from "bun:test";

import {
	NOTICE_ACTIONS,
	codeTargetShellNotice,
	holdNotice,
	noteNotices,
	staleFrontendNotice,
	withNotice,
	withoutNotice,
} from "@/ui/application/notices";
import { addPane, initialPaneList } from "@/ui/application/pane-list";
import {
	emptyPaneStatus,
	initialPaneRecord,
	type PaneRecords,
} from "@/ui/application/pane-records";
import type { BoardHold } from "@/ui/types";

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

test("note notices are derived from the records, in pane order, and absent otherwise", () => {
	const list = addPane(initialPaneList());
	expect(noteNotices(list, {})).toEqual([]);
	const hold: BoardHold = {
		board: "Checkout",
		since: "2026-09-06T10:00:00.000Z",
		writes: 3,
		fromScreen: false,
		conflict: {
			board: "Checkout",
			file: "Checkout.md",
			reason: "changed",
			outcomes: { reload: "", overwrite: "", saveAs: "" },
			message: "",
		},
		message: "",
	};
	const records: PaneRecords = {
		B: { ...initialPaneRecord("B"), status: { ...emptyPaneStatus("B"), hold } },
		A: {
			...initialPaneRecord("A"),
			status: {
				...emptyPaneStatus("A"),
				boardKey: "Billing",
				writtenElsewhere: {
					board: "Billing",
					file: "Billing.md",
					reason: "changed",
					writtenAt: "2026-09-06T10:01:00.000Z",
					versionMove: "unchanged",
					version: null,
					ourVersion: null,
					message: "",
				},
			},
		},
	};
	const notices = noteNotices(list, records);
	expect(notices.map((notice) => notice.id)).toEqual(["elsewhere:A", "hold:B"]);
	expect(notices[0]?.title).toBe("Billing was written elsewhere");
	expect(notices[1]?.description).toContain("3 change(s)");
});
