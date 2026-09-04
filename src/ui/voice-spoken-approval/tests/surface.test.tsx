import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { VoiceSpokenApproval } from "../index.js";
import { input, spokenApproval, spokenIdentities } from "./fixtures.js";

test("renders one flat display-only region with canonical gate and user-final evidence", () => {
	const html = renderToStaticMarkup(
		createElement(VoiceSpokenApproval, {
			...input({ spokenApproval: spokenApproval("resolving") }),
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
	expect(html).toContain(String(spokenIdentities.COORDINATOR_THREAD_ID));
	expect(html).toContain(String(spokenIdentities.PROMPT_ID));
	expect(html).toContain(String(spokenIdentities.ITEM_ID));
	expect(html).toContain(String(spokenIdentities.SESSION_ID));
	expect(html).toContain("Approve that command.");
	expect(html).toContain('data-spoken-evidence-authority="captured_user_final"');
	for (const tag of ["button", "input", "select", "textarea", "form"])
		expect(html).not.toContain(`<${tag}`);
});

test("explains assistant-only fallback without inventing assistant evidence", () => {
	const html = renderToStaticMarkup(
		createElement(VoiceSpokenApproval, {
			...input({
				spokenApproval: spokenApproval("visual_fallback", {
					capturedUserFinal: null,
					reason: "assistant_only",
				}),
			}),
		}),
	);

	expect(html).toContain('data-spoken-approval-state="visual_fallback"');
	expect(html).toContain("assistant output is non-authoritative");
	expect(html).not.toContain("Captured final user utterance");
	expect(html).not.toContain("data-spoken-evidence-authority");
	expect(html).toContain('data-visual-card-preserved="true"');
});
