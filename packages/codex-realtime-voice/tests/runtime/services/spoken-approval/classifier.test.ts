import { describe, expect, test } from "bun:test";

import {
	SPOKEN_APPROVAL_CLASSIFIER_SHA256,
	SPOKEN_APPROVAL_CLASSIFIER_TEMPLATE,
	createSpokenApprovalClassifierPrompt,
	verifySpokenApprovalClassifierIntegrity,
} from "#runtime/rules/spoken-approval/classifier.ts";

describe("spoken approval classifier contract", () => {
	test("keeps the reviewed bytes and digest intact", () => {
		expect(verifySpokenApprovalClassifierIntegrity()).toBe(SPOKEN_APPROVAL_CLASSIFIER_SHA256);
		expect(SPOKEN_APPROVAL_CLASSIFIER_TEMPLATE.endsWith("\n")).toBe(true);
		expect(SPOKEN_APPROVAL_CLASSIFIER_TEMPLATE.endsWith("\n\n")).toBe(false);
	});

	test("substitutes only the captured effect and final user item", () => {
		const prompt = createSpokenApprovalClassifierPrompt({
			productName: "Payments",
			voiceNamespace: "host_voice",
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
		expect(prompt).toContain("call host_voice.resolve_spoken_approval once");
		expect(prompt).toContain("approval for Payments. The Payments server");
		expect(() =>
			createSpokenApprovalClassifierPrompt({
				productName: "Payments",
				voiceNamespace: "host voice",
				effectSummary: "Run echo approved",
				finalUserItemId: "user-final",
				finalUserSequence: 11,
				finalUserText: "yes, run it",
			}),
		).toThrow(TypeError);
	});

	test("asks a host's classifier through the host's voice namespace, byte for byte as reviewed", () => {
		// The digest of Archboard's classifier prompt before its names became host identity.
		const named = SPOKEN_APPROVAL_CLASSIFIER_TEMPLATE.replaceAll(
			"<product-name>",
			"Archboard",
		).replace("<voice-namespace>", "archboard_voice");
		expect(new Bun.CryptoHasher("sha256").update(named).digest("hex")).toBe(
			"1873dd2050fe6f6ce41cd27f43af18d8c7a3cd4af9755dd7b0322e375f636380",
		);
	});
});
