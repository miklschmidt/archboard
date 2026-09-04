import { afterAll, expect, test } from "bun:test";
import { createElement } from "react";

import { loadRenderedUiTools, registerHappyDom, unregisterHappyDom } from "../index.js";

registerHappyDom();
const { render, screen, userEvent } = await loadRenderedUiTools();
const { Button } = await import("@/ui/button");

afterAll(unregisterHappyDom);

// One owner for the opt-in harness itself: a real Archboard component mounts in
// a real DOM, a real pointer sequence reaches it, and the accessible name and
// focus survive. Existing hand-written harnesses keep their own leaf owners.
test("mounts a real component, clicks it, and keeps its accessible name and focus", async () => {
	const user = userEvent.setup();
	const clicked: string[] = [];
	render(
		createElement(
			Button,
			{
				tone: "primary",
				"aria-label": "Claim the board",
				onClick: () => clicked.push("claim"),
			},
			"Claim",
		),
	);

	const button = screen.getByRole("button", { name: "Claim the board" });
	expect(button.tagName).toBe("BUTTON");
	expect(document.activeElement).not.toBe(button);

	await user.click(button);

	expect(clicked).toEqual(["claim"]);
	expect(document.activeElement).toBe(button);
});
