import { afterAll, afterEach, expect, test } from "bun:test";

import {
	loadRenderedUiTools,
	registerHappyDom,
	unregisterHappyDom,
} from "../../dom-testing/index.js";

registerHappyDom();
const { cleanup, render, screen } = await loadRenderedUiTools();
const { VoiceSpokenApproval } = await import("../index.js");
const { capturedItem, gate, input, voice } = await import("./fixtures.js");

afterEach(cleanup);
afterAll(unregisterHappyDom);

test("names the section and status while exposing no decision control", () => {
	const final = capturedItem();
	render(
		<VoiceSpokenApproval
			{...input({ gate: gate("resolving", { capturedItem: final }), voice: voice([final]) })}
		/>,
	);

	const region = screen.getByRole("region", { name: "Voice evidence" });
	expect(region.dataset.spokenApproval).toBe("display-only");
	expect(region.dataset.visualCardPreserved).toBe("true");
	expect(
		screen.getByRole("status", { name: "Spoken approval status: Resolving" }).textContent,
	).toBe("Resolving");
	expect(screen.getByRole("region", { name: "Spoken utterance evidence" }).textContent).toContain(
		"Approve that command.",
	);
	expect(screen.queryByRole("button")).toBeNull();
	expect(document.querySelector("input, select, textarea, form")).toBeNull();
});

test("keeps the preserved-card signal and a named visual-only status on failure", () => {
	render(
		<VoiceSpokenApproval {...input({ gate: gate("visual_fallback", { reason: "ambiguous" }) })} />,
	);

	const region = screen.getByRole("region", { name: "Voice evidence" });
	expect(region.dataset.visualCardPreserved).toBe("true");
	expect(
		screen.getByRole("status", { name: "Spoken approval status: Visual only" }),
	).not.toBeNull();
	expect(region.textContent).toContain("later ordinary coordinator classifier turn");
});
