// A tab list over panels, as the WAI-ARIA tabs pattern describes: a click or the arrow keys
// select a tab, and only its panel shows. Each tab names its panel with data-tab, and the panel
// carries the same value in data-panel.

/**
 * Make the tabs inside one root work.
 * @param root The element that holds the tab list and the panels.
 */
export function mountTabs(root: HTMLElement): void {
	const tabs = [...root.querySelectorAll<HTMLButtonElement>("[role='tab'][data-tab]")];
	const select = (tab: HTMLButtonElement, focus: boolean) => {
		for (const other of tabs) {
			const on = other === tab;
			other.setAttribute("aria-selected", String(on));
			other.tabIndex = on ? 0 : -1;
			const panel = root.querySelector<HTMLElement>(`[data-panel="${other.dataset["tab"]}"]`);
			if (panel) panel.hidden = !on;
		}
		if (focus) tab.focus();
	};
	tabs.forEach((tab, index) => {
		tab.addEventListener("click", () => select(tab, false));
		tab.addEventListener("keydown", (event) => {
			const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key] ?? 0;
			if (!step) return;
			event.preventDefault();
			const next = tabs[(index + step + tabs.length) % tabs.length];
			if (next) select(next, true);
		});
	});
}
