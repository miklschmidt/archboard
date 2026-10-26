import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { createElement, type JSX } from "react";

import type { SemanticVariant } from "@archboard/board/document";
import { VariantContentSchema } from "@archboard/board/content";
import { usePlacedChoice } from "#ui/hooks/semantic-board-canvas/use-placed-choice.ts";
import { PaneVaultContext } from "#ui/state/semantic-board-canvas/pane-vault.ts";

beforeAll(() => {
	GlobalRegistrator.register();
	Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
});

afterEach(cleanup);
afterAll(async () => {
	await GlobalRegistrator.unregister();
});

const VARIANT: SemanticVariant = {
	id: "v1",
	name: "Built",
	lifecycle: "current",
	content: VariantContentSchema.parse({ nodes: [] }),
};

/**
 * Both checkouts offer the same choice.
 * @returns True.
 */
function keeps(): boolean {
	return true;
}

/**
 * A choice on the checkout's copy of the Checkout and orders board.
 * @returns The chosen subject and a control that chooses it.
 */
function ChoiceProbe(): JSX.Element {
	const choice = usePlacedChoice("Checkout and orders", VARIANT, keeps, false);
	/** Choose the subject on the board. */
	function choose(): void {
		choice.choose("order");
	}
	return createElement("button", {
		type: "button",
		"data-choice": choice.chosen ?? "",
		onClick: choose,
	});
}

/**
 * The reader in one checkout's vault.
 * @param vault Its vault.
 * @returns The reader.
 */
function paneIn(vault: string): JSX.Element {
	return createElement(PaneVaultContext, { value: vault }, createElement(ChoiceProbe));
}

test("a choice is discarded when the pane changes checkouts, even when both copies share the board and variant", () => {
	const { container, rerender } = render(paneIn("/shop/main/.archboard/vault"));
	act(() => {
		fireEvent.click(container.querySelector("button")!);
	});
	expect(container.querySelector("button")?.getAttribute("data-choice")).toBe("order");

	rerender(paneIn("/shop/proposal/.archboard/vault"));
	expect(container.querySelector("button")?.getAttribute("data-choice")).toBe("");

	rerender(paneIn("/shop/main/.archboard/vault"));
	expect(container.querySelector("button")?.getAttribute("data-choice")).toBe("");
});
