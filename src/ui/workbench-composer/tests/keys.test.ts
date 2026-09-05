import { describe, expect, test } from "bun:test";

import {
	composerDraftDisposition,
	composerKeyIntent,
	transportRefusalMessage,
	type ComposerKeyEvent,
} from "@/ui/workbench-composer";

/**
 * A key event with Enter and no modifiers unless overridden.
 * @param overrides The fields to replace.
 * @returns The event.
 */
function keyEvent(overrides: Partial<ComposerKeyEvent> = {}): ComposerKeyEvent {
	return {
		key: "Enter",
		shiftKey: false,
		ctrlKey: false,
		metaKey: false,
		altKey: false,
		isComposing: false,
		...overrides,
	};
}

describe("the composer's own keyboard decision", () => {
	test("plain Enter submits", () => {
		expect(composerKeyIntent(keyEvent(), false)).toBe("submit");
	});

	test("Shift+Enter inserts a newline instead of sending", () => {
		expect(composerKeyIntent(keyEvent({ shiftKey: true }), false)).toBe("newline");
	});

	test("a modifier other than Shift neither sends nor claims the key", () => {
		for (const modifier of ["ctrlKey", "metaKey", "altKey"] as const) {
			expect(composerKeyIntent(keyEvent({ [modifier]: true }), false)).toBe("pass");
		}
	});

	test("every other key is left to the textarea", () => {
		for (const key of ["a", "Escape", "Tab", "ArrowUp", " "]) {
			expect(composerKeyIntent(keyEvent({ key }), false)).toBe("pass");
		}
	});

	test("Enter never submits while the event reports an open IME composition", () => {
		expect(composerKeyIntent(keyEvent({ isComposing: true }), false)).toBe("pass");
	});

	test("Enter never submits while the module's own composition state is open", () => {
		expect(composerKeyIntent(keyEvent(), true)).toBe("pass");
	});

	test("the composition guard beats Shift, so a candidate is confirmed either way", () => {
		expect(composerKeyIntent(keyEvent({ shiftKey: true, isComposing: true }), false)).toBe("pass");
		expect(composerKeyIntent(keyEvent({ shiftKey: true }), true)).toBe("pass");
	});

	test("Enter submits again once the composition has ended", () => {
		expect(composerKeyIntent(keyEvent(), false)).toBe("submit");
	});
});

describe("the documented draft policy", () => {
	test("each settled outcome has exactly one disposition", () => {
		expect(composerDraftDisposition("delivered")).toBe("cleared");
		expect(composerDraftDisposition("not_delivered")).toBe("restored");
		expect(composerDraftDisposition("outcome_unknown")).toBe("retained");
	});
});

describe("the transport's refusals in the composer's words", () => {
	test("each transport refusal code the composer can meet has its own sentence", () => {
		const codes = [
			"link_changed",
			"link_required",
			"lease_required",
			"lease_expired",
			"lease_released",
			"not_ready",
			"socket_unavailable",
			"incompatible_contract",
			"response_lost",
			"replaced",
			"invalid_command",
		];
		const messages = codes.map((code) => transportRefusalMessage(code));
		expect(new Set(messages).size).toBe(codes.length);
		expect(messages).not.toContain("The host refused this workhorse command.");
	});

	test("an unknown code still says something true", () => {
		expect(transportRefusalMessage("something_new")).toBe(
			"The host refused this workhorse command.",
		);
	});
});
