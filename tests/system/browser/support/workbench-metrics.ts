export interface WorkbenchSnapshot {
	bar: string | null;
	connection: string | null;
	holder: string | null;
	live: string | null;
	pane: string | null;
	reason: string | null;
	take: string | null;
	takeBackAnnouncement: string | null;
	takeBackOutcomeVisible: boolean;
	state: string | null;
	semantic: string | null;
	takeBackState: string | null;
	steps: string[];
	what: string | null;
	takeBackHeight: number;
	stripHeight: number;
}

export const WORKBENCH_SNAPSHOT_EXPRESSION = `(() => {
	const strip = document.querySelector('.agent-status-strip');
	const output = strip?.querySelector('output:not(.workbench-semantic-announcer)');
	const claim = strip?.querySelector('[data-agent-claim]');
	const current = strip?.querySelector('[data-agent-current]');
	const action = strip?.querySelector('.pane-claim-take');
	const reason = claim?.getAttribute('title') ?? null;
	const bar = current?.getAttribute('title') ?? null;
	const outcome = strip?.querySelector('[data-take-back-outcome]');
	const outcomeVisible = () => {
		if (!outcome) return false;
		const rect = outcome.getBoundingClientRect();
		if (!rect.width || !rect.height) return false;
		for (let parent = outcome.parentElement; parent; parent = parent.parentElement) {
			const bounds = parent.getBoundingClientRect();
			const style = getComputedStyle(parent);
			if (style.overflowY !== 'visible' && (rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1)) return false;
		}
		return rect.top >= 0 && rect.bottom <= innerHeight;
	};
	return {
		connection: strip?.getAttribute('data-connection') ?? null,
		holder: output?.firstElementChild?.textContent?.trim() ?? null,
		live: output?.getAttribute('aria-live') ?? null,
		pane: strip?.getAttribute('aria-label')?.replace(/ board activity$/, '') ?? null,
		reason,
		what: reason,
		bar,
		steps: bar ? [bar] : [],
		take: action?.textContent?.trim() ?? null,
		takeBackAnnouncement: strip?.querySelector('[data-take-back-outcome]')?.textContent?.trim() ?? null,
		takeBackOutcomeVisible: outcomeVisible(),
		state: strip?.getAttribute('data-state') ?? null,
		semantic: strip?.getAttribute('data-semantic') ?? null,
		takeBackState: strip?.getAttribute('data-take-back') ?? null,
		takeBackHeight: action?.getBoundingClientRect().height ?? 0,
		stripHeight: strip?.getBoundingClientRect().height ?? 0,
	};
})()`;
