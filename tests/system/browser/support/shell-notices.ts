// The one notice a browser owner raises for itself, and how it reads it back.
//
// Raised through the pane's own `onCodeTargetNotice`, which is how the real
// failure reaches the shell: the owner reaches into the mounted pane's props
// rather than posting a fake into the notice stack, so what it proves is the
// path a real refusal takes.

import type { AgentBrowserSession } from "./agent-browser.ts";
import { SHELL_NOTICES } from "./shell-dom.ts";

/** The notice text every owner that needs one raises. */
const PERSISTENT_NOTICE_TEXT = "Persistent actionable notice survives presentation.";

/**
 * Raise the notice through the pane that owns it.
 * @param browser The page.
 * @returns True when a pane was found to raise it through.
 */
function publishActionableNotice(browser: AgentBrowserSession): Promise<boolean> {
	return browser.eval<boolean>(`(() => {
		const stage = document.querySelector('[data-slot="pane-stage"]');
		const key = stage && Object.keys(stage).find(candidate => candidate.startsWith('__reactFiber$'));
		let fiber = key ? stage[key] : null;
		for (let depth = 0; fiber && depth < 60; depth += 1, fiber = fiber.return) {
			const notify = fiber.memoizedProps?.host?.onCodeTargetNotice
				?? fiber.memoizedProps?.options?.onCodeTargetNotice;
			if (typeof notify !== 'function') continue;
			notify({ message: ${JSON.stringify(PERSISTENT_NOTICE_TEXT)},
				actions: [{ kind: 'settings', label: 'Opener settings' }] });
			return true;
		}
		return false;
	})()`);
}

/** The persistent notice as an owner reads it: its words, first action, and visibility. */
function readShellNotice(
	browser: AgentBrowserSession,
): Promise<{ text: string | null; action: string | null; visible: boolean }> {
	return browser.eval(`(() => {
		const notice = ${SHELL_NOTICES}.find(node =>
			node.querySelector('[data-slot="alert-description"]')?.textContent?.trim() === ${JSON.stringify(PERSISTENT_NOTICE_TEXT)});
		const rect = notice?.getBoundingClientRect();
		const shown = !!rect && rect.width > 0 && rect.height > 0 &&
			(document.fullscreenElement === null || document.fullscreenElement.contains(notice));
		return {
			text: notice?.querySelector('[data-slot="alert-description"]')?.textContent?.trim() ?? null,
			action: notice?.querySelector('[data-slot="alert-action"] button')?.textContent?.trim() ?? null,
			visible: shown,
		};
	})()`);
}

export { PERSISTENT_NOTICE_TEXT, publishActionableNotice, readShellNotice };
