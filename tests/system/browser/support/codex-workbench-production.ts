import { readFileSync } from "node:fs";

import type { ProductionFixture } from "../../server-state/support/codex-production.ts";
import type { AgentBrowserSession } from "./agent-browser.ts";

/** The agent dock at the foot of the navigator: the agent's state, its voice and the key to the conversation. */
const AGENT_DOCK = 'section[data-slot="agent-dock"]';

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

export {
	AGENT_DOCK,
	type WorkbenchControlOperability,
	productionFixtureRecords,
	workbenchControlOperability,
};
