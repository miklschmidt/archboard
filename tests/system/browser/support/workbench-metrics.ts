import { CLAIM_BANNER, PANE_SECTIONS, PANE_TABS } from "./shell-dom.ts";

/** What the shell says about the active pane's board, its claim and its take-back. */
export interface WorkbenchSnapshot {
	/** The active pane's label, from the pressed pane tab. */
	pane: string | null;
	/** The header's connection words: Connected or Disconnected. */
	connection: string | null;
	/** The header claim badge's label, or null while the board is free. */
	headerClaim: string | null;
	/** The claim reason the header badge shows, or null. */
	reason: string | null;
	/** The claim banner across the active pane, or null while nobody claims it. */
	banner: {
		text: string;
		reason: string | null;
		height: number;
	} | null;
	/** The take-back control's words, or null without a claim. */
	take: string | null;
	/** idle, pending or failed, as the banner presents the take-back; null without a claim. */
	takeBackState: "idle" | "pending" | "failed" | null;
	/** The failure words beside the control, or null. */
	takeBackMessage: string | null;
	takeBackHeight: number;
	/** The dock's latest `doing` line, or null while nothing is in progress. */
	doing: string | null;
	/** The dock's recent-activity lines, oldest first. */
	history: string[];
	/** The claim banner in a pane that is not active, by pane label. */
	otherBanners: string[];
}

export const WORKBENCH_SNAPSHOT_EXPRESSION = `(() => {
	const ownText = node => [...node.childNodes].filter(child => child.nodeType === 3).map(child => child.textContent).join('').trim();
	const header = document.querySelector('header');
	const spans = [...(header?.querySelectorAll('span') ?? [])];
	const connection = spans.find(node => /^(Connected|Disconnected)$/.test(ownText(node)));
	const claimLabel = spans.find(node => /^Board (claimed|held)$/.test(ownText(node)));
	const claimReason = claimLabel?.nextElementSibling;
	const activeTab = document.querySelector('${PANE_TABS}[aria-pressed="true"]');
	const activeSection = document.querySelector('${PANE_SECTIONS}[aria-current="true"]');
	const banner = activeSection?.querySelector('${CLAIM_BANNER}') ?? null;
	const take = banner ? [...banner.querySelectorAll('button')].find(node => /Tak(e|ing) back control/.test(node.textContent)) : null;
	const failure = banner ? [...banner.querySelectorAll('span')].find(node => /could not be taken back/.test(ownText(node))) : null;
	const bannerReason = banner ? [...banner.querySelectorAll('span')].find(node => node.classList.contains('truncate')) : null;
	const dock = [...document.querySelectorAll('[data-slot="collapsible"]')]
		.find(node => node.querySelector('button[aria-label$="workbench"]'));
	const title = [...(dock?.querySelectorAll('span') ?? [])].find(node => node.textContent.trim() === 'Agent workbench');
	const doingLine = title?.nextElementSibling ?? null;
	const doing = doingLine && !/Nothing in progress/.test(doingLine.textContent) ? doingLine.querySelector('span')?.textContent?.trim() ?? null : null;
	const takeBackState = !banner ? null : take?.getAttribute('aria-busy') === 'true' ? 'pending' : failure ? 'failed' : 'idle';
	return {
		pane: activeTab?.querySelector('span')?.textContent?.trim().split(' · ')[0] ?? null,
		connection: connection ? ownText(connection) : null,
		headerClaim: claimLabel ? ownText(claimLabel) : null,
		reason: claimReason ? claimReason.textContent.replace(/^·\\s*/, '').trim() : null,
		banner: banner ? { text: banner.textContent.replace(/\\s+/g, ' ').trim(), reason: bannerReason?.textContent?.trim() ?? null, height: banner.getBoundingClientRect().height } : null,
		take: take?.textContent?.trim() ?? null,
		takeBackState,
		takeBackMessage: failure ? ownText(failure) : null,
		takeBackHeight: take?.getBoundingClientRect().height ?? 0,
		doing,
		history: [...(dock?.querySelectorAll('ol[aria-label="Recent activity"] li') ?? [])].map(node => node.textContent.trim()),
		otherBanners: [...document.querySelectorAll('${PANE_SECTIONS}:not([aria-current="true"]) ${CLAIM_BANNER}')].map(node => node.closest('section')?.getAttribute('aria-label') ?? ''),
	};
})()`;
