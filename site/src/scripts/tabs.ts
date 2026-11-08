// A tab list over panels, as the WAI-ARIA tabs pattern describes: a click or the arrow keys
// select a tab, and only its panel shows. Each tab names its panel with data-tab, and the panel
// carries the same value in data-panel.

/**
 * Make the tabs inside one root work.
 * @param root The element that holds the tab list and the panels.
 * @param onSelect Told the data-tab value of each tab that the reader selects.
 * @returns A function that shows the tab with a data-tab value, without focus and without onSelect.
 */
export function mountTabs(
	root: HTMLElement,
	onSelect?: (key: string) => void,
): (key: string) => void {
	const tabs = [...root.querySelectorAll<HTMLButtonElement>("[role='tab'][data-tab]")];
	const show = (tab: HTMLButtonElement) => {
		for (const other of tabs) {
			const on = other === tab;
			other.setAttribute("aria-selected", String(on));
			other.tabIndex = on ? 0 : -1;
			const panel = root.querySelector<HTMLElement>(`[data-panel="${other.dataset["tab"]}"]`);
			if (panel) panel.hidden = !on;
		}
	};
	const select = (tab: HTMLButtonElement, focus: boolean) => {
		show(tab);
		if (focus) tab.focus();
		onSelect?.(tab.dataset["tab"] ?? "");
	};
	tabs.forEach((tab, index) => {
		tab.addEventListener("click", () => select(tab, false));
		tab.addEventListener("keydown", (event) => {
			if (event.altKey || event.ctrlKey || event.metaKey) return;
			let nextIndex: number;
			switch (event.key) {
				case "Home":
					nextIndex = 0;
					break;
				case "End":
					nextIndex = tabs.length - 1;
					break;
				case "ArrowRight":
					nextIndex = (index + 1) % tabs.length;
					break;
				case "ArrowLeft":
					nextIndex = (index - 1 + tabs.length) % tabs.length;
					break;
				default:
					return;
			}
			const next = tabs[nextIndex];
			if (!next) return;
			event.preventDefault();
			select(next, true);
		});
	});
	return (key) => {
		const tab = tabs.find((candidate) => candidate.dataset["tab"] === key);
		if (tab) show(tab);
	};
}
