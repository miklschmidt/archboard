import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { VoiceSpokenApproval } from "../index.js";
import { capturedItem, gate, input, spokenIdentities, voice } from "./fixtures.js";

test("renders one flat display-only region with immutable gate and utterance evidence", () => {
	const final = capturedItem();
	const html = renderToStaticMarkup(
		createElement(VoiceSpokenApproval, {
			...input({ gate: gate("resolving", { capturedItem: final }), voice: voice([final]) }),
		}),
	);

	expect(html).toContain('data-spoken-approval="display-only"');
	expect(html).toContain('data-spoken-approval-state="resolving"');
	expect(html).toContain('data-visual-card-preserved="true"');
	expect(html).toContain("The ordinary approval card stays visible.");
	expect(html).toContain("later ordinary coordinator classifier turn");
	expect(html).toContain(String(spokenIdentities.REQUEST_ID));
	expect(html).toContain("run bun test for the selected module");
	expect(html).toContain(String(spokenIdentities.CHILD));
	expect(html).toContain("thread-coordinator-1");
	expect(html).toContain(String(spokenIdentities.PROMPT_ID));
	expect(html).toContain(String(spokenIdentities.ITEM_ID));
	expect(html).toContain(String(spokenIdentities.SESSION_ID));
	expect(html).toContain("Approve that command.");
	expect(html).toContain('data-spoken-evidence-authority="captured_user_final"');
	for (const tag of ["button", "input", "select", "textarea", "form"])
		expect(html).not.toContain(`<${tag}`);
});

test("labels assistant output non-authoritative and keeps the ordinary card available", () => {
	const assistant = capturedItem({ speaker: "assistant", text: "Approve it." });
	const html = renderToStaticMarkup(
		createElement(VoiceSpokenApproval, {
			...input({ gate: gate("armed", { capturedItem: assistant }), voice: voice([assistant]) }),
		}),
	);

	expect(html).toContain('data-spoken-approval-state="visual_fallback"');
	expect(html).toContain('data-spoken-evidence-authority="non_authoritative"');
	expect(html).toContain("Non-authoritative assistant output");
	expect(html).toContain("Cannot settle this request");
	expect(html).toContain('data-visual-card-preserved="true"');
});
