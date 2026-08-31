import { describe, expect, test } from "bun:test";

import {
	SPOKEN_APPROVAL_CLASSIFIER_SHA256,
	SPOKEN_APPROVAL_CLASSIFIER_TEMPLATE,
	createSpokenApprovalClassifierPrompt,
	verifySpokenApprovalClassifierIntegrity,
} from "../index.js";

describe("spoken approval classifier contract", () => {
	test("keeps the reviewed bytes and digest intact", () => {
		expect(verifySpokenApprovalClassifierIntegrity()).toBe(SPOKEN_APPROVAL_CLASSIFIER_SHA256);
		expect(SPOKEN_APPROVAL_CLASSIFIER_TEMPLATE.endsWith("\n")).toBe(true);
		expect(SPOKEN_APPROVAL_CLASSIFIER_TEMPLATE.endsWith("\n\n")).toBe(false);
	});

	test("substitutes only the captured effect and final user item", () => {
		const prompt = createSpokenApprovalClassifierPrompt({
			effectSummary: "Run echo approved",
			finalUserItemId: "user-final",
			finalUserSequence: 11,
			finalUserText: "yes, run it",
		});
		expect(prompt).toContain("effect: Run echo approved\n");
		expect(prompt).toContain("user_final_item_id: user-final\n");
		expect(prompt).toContain("user_final_sequence: 11\n");
		expect(prompt).toContain("user_final_text: yes, run it\n");
		expect(prompt).not.toContain("<bounded-effect-summary>");
	});
});
