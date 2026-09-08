import { editingModifier } from "./keyboard.ts";
import { expect } from "bun:test";

import { pollUntil, type AgentBrowserSession } from "./agent-browser.ts";
import { dialogSnapshot } from "./opener-settings.ts";
import { openSettingsItem, switchTheme } from "./shell-dom.ts";

type ShellTheme = "light" | "dark";

function roleAction(
	browser: AgentBrowserSession,
	role: string,
	name: string,
	action: "click" | "text" = "click",
): Promise<string> {
	return browser.run(["find", "role", role, action, "--name", name, "--exact"], {
		timeoutMs: 10_000,
	});
}

/** agent-browser omits the CDP macOS selectAll command; select only, then type normally. */
async function selectFieldText(browser: AgentBrowserSession): Promise<void> {
	if (process.platform === "darwin") {
		expect(
			await browser.eval<boolean>(
				"(() => { const field = document.activeElement; if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return false; field.setSelectionRange(0, field.value.length); return field.selectionStart === 0 && field.selectionEnd === field.value.length; })()",
			),
		).toBe(true);
	} else {
		await browser.run(["press", `${editingModifier}+a`]);
	}
}

/**
 * Replace a labelled field's value from the keyboard: select all, delete, type.
 * @param browser The page.
 * @param label The field's label.
 * @param value The new value.
 */
async function fillLabel(
	browser: AgentBrowserSession,
	label: string,
	value: string,
): Promise<void> {
	await browser.run(["find", "label", label, "click", "--exact"]);
	await selectFieldText(browser);
	await browser.run(["press", "Backspace"]);
	await browser.run(["keyboard", "type", value]);
}

/**
 * Open the opener settings dialog the way a person does: the header settings
 * menu, then its item.
 * @param browser The page.
 */
async function openOpenerSettings(browser: AgentBrowserSession): Promise<void> {
	await openSettingsItem(browser, "Opener settings");
	// Clicks land only once the dialog has finished animating into place.
	await pollUntil(
		() =>
			browser.eval<string[]>(
				`(() => { const dialog = document.querySelector('[role="dialog"]'); return dialog ? dialog.getAnimations().map(animation => animation.playState) : ['missing']; })()`,
			),
		(states) => states.every((state) => state === "finished"),
		"the opener settings dialog to settle in place",
		{ timeoutMs: 5_000 },
	);
}

/**
 * Switch the shell theme through the header toggle.
 * @param browser The page.
 * @param theme The theme wanted.
 */
async function setTheme(browser: AgentBrowserSession, theme: ShellTheme): Promise<void> {
	await switchTheme(browser, theme);
}

/**
 * The dialog is gone and focus is back on the settings trigger it came from.
 * @param browser The page.
 */
async function assertDialogClosedAndFocusReturned(browser: AgentBrowserSession): Promise<void> {
	await pollUntil(
		() => dialogSnapshot(browser),
		(value) => value === null,
		"the opener settings dialog to close",
	);
	expect(
		await browser.eval<string>(
			"(document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName ?? 'none') + ' · dialogs ' + document.querySelectorAll('[role=dialog]').length",
		),
	).toBe("Settings · dialogs 0");
}

export { roleAction, fillLabel, openOpenerSettings, setTheme, assertDialogClosedAndFocusReturned };

/**
 * Type the Arguments textarea the way a person does: one argument per line,
 * Enter between them. `fill` would flatten the newlines.
 * @param browser The page.
 * @param lines The arguments, one per line.
 */
async function fillArguments(
	browser: AgentBrowserSession,
	lines: readonly string[],
): Promise<void> {
	await browser.run(["find", "label", "Arguments", "click", "--exact"]);
	await selectFieldText(browser);
	await browser.run(["press", "Backspace"]);
	for (const [index, line] of lines.entries()) {
		if (index > 0) {
			await browser.run(["press", "Enter"]);
		}
		await browser.run(["keyboard", "type", line]);
	}
}

export { fillArguments };
