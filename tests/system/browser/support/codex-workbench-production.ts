import { readFileSync } from "node:fs";

import type { ProductionFixture } from "../../server-state/support/codex-production.ts";
import { AGENT_DOCK, AGENT_PANEL } from "./shell-dom.ts";
import type { AgentBrowserSession } from "./agent-browser.ts";

interface WorkbenchControlOperability {
	readonly width: number;
	readonly height: number;
	readonly visibleWidth: number;
	readonly visibleHeight: number;
	readonly clipped: boolean;
	readonly centerHit: boolean;
	readonly operable: boolean;
}

function productionFixtureRecords<RecordType>(fixture: ProductionFixture): RecordType[] {
	return readFileSync(fixture.logPath, "utf8")
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line) as RecordType);
}

function workbenchControlOperability(
	browser: AgentBrowserSession,
	selector: string,
): Promise<WorkbenchControlOperability> {
	return browser.eval<WorkbenchControlOperability>(`(() => {
		const control = document.querySelector(${JSON.stringify(selector)});
		if (!(control instanceof HTMLButtonElement)) throw new Error('Missing rendered workbench control.');
		const rect = node => node?.getBoundingClientRect() ?? new DOMRect();
		const bounds = rect(control);
		const visible = { left: Math.max(0, bounds.left), top: Math.max(0, bounds.top),
			right: Math.min(innerWidth, bounds.right), bottom: Math.min(innerHeight, bounds.bottom) };
		for (let owner = control.parentElement; owner; owner = owner.parentElement) {
			const style = getComputedStyle(owner);
			const clip = rect(owner);
			if (/^(auto|clip|hidden|scroll)$/.test(style.overflowX)) {
				visible.left = Math.max(visible.left, clip.left);
				visible.right = Math.min(visible.right, clip.right);
			}
			if (/^(auto|clip|hidden|scroll)$/.test(style.overflowY)) {
				visible.top = Math.max(visible.top, clip.top);
				visible.bottom = Math.min(visible.bottom, clip.bottom);
			}
		}
		const visibleWidth = Math.max(0, visible.right - visible.left);
		const visibleHeight = Math.max(0, visible.bottom - visible.top);
		const clipped = visibleWidth < bounds.width || visibleHeight < bounds.height;
		const center = document.elementFromPoint(
			bounds.left + bounds.width / 2,
			bounds.top + bounds.height / 2,
		);
		const centerHit = control.contains(center);
		return {
			width: bounds.width,
			height: bounds.height,
			visibleWidth,
			visibleHeight,
			clipped,
			centerHit,
			operable: visibleWidth >= 24 && visibleHeight >= 24 && !clipped && centerHit,
		};
	})()`);
}

/** What the agent dock and the conversation show, read through their hooks. */
interface AgentSurface {
	/** How the dock lights the agent's state: quiet, working, attention or failed. */
	readonly tone: string | null;
	readonly panelOpen: boolean;
	readonly held: { readonly state: string | null; readonly text: string }[];
	readonly prompts: string[];
	/** Links and buttons the dock offers, by href or accessible name. */
	readonly dockLinks: (string | null)[];
	readonly dockButtons: string[];
	readonly cards: {
		readonly busy: boolean;
		readonly details: string;
		readonly decisions: string[];
		readonly top: number;
	}[];
	/** The bottom edge of the conversation's last prompt, for the cards' place. */
	readonly promptBottom: number | null;
}

function agentSurface(browser: AgentBrowserSession): Promise<AgentSurface> {
	return browser.eval<AgentSurface>(`(() => {
		const panel = document.querySelector('${AGENT_PANEL}');
		const dock = document.querySelector('${AGENT_DOCK}');
		const named = node => (node.getAttribute('aria-label') ?? node.textContent ?? '').trim();
		const prompts = [...(panel?.querySelectorAll('[data-slot="prompt"]') ?? [])];
		return {
			tone: dock?.getAttribute('data-agent-tone') ?? null,
			panelOpen: panel !== null,
			held: [...(panel?.querySelectorAll('[data-slot="held-prompt"]') ?? [])].map(node => ({
				state: node.getAttribute('data-state'),
				text: node.textContent ?? '',
			})),
			prompts: prompts.map(node => node.textContent ?? ''),
			dockLinks: [...(dock?.querySelectorAll('a') ?? [])].map(node => node.getAttribute('href')),
			dockButtons: [...(dock?.querySelectorAll('button') ?? [])].map(named),
			cards: [...(panel?.querySelectorAll('article[data-slot="approval"]') ?? [])].map(card => ({
				busy: card.getAttribute('aria-busy') === 'true',
				details: [...card.querySelectorAll('dd')].map(node => node.textContent).join('\\n'),
				decisions: [...card.querySelectorAll('button')].map(named),
				top: card.getBoundingClientRect().top,
			})),
			promptBottom: prompts.at(-1)?.getBoundingClientRect().bottom ?? null,
		};
	})()`);
}

export {
	agentSurface,
	type WorkbenchControlOperability,
	productionFixtureRecords,
	workbenchControlOperability,
};
