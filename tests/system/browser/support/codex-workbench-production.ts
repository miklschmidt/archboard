import { expect } from "bun:test";
import { readFileSync } from "node:fs";

import type { ProductionFixture } from "../../canvas-state/support/codex-production.ts";
import type { AgentBrowserSession } from "./agent-browser.ts";

export interface WorkbenchControlOperability {
	readonly width: number;
	readonly height: number;
	readonly visibleWidth: number;
	readonly visibleHeight: number;
	readonly clipped: boolean;
	readonly requestOverlap: boolean;
	readonly centerHit: boolean;
	readonly operable: boolean;
}

export function productionFixtureRecords<RecordType>(fixture: ProductionFixture): RecordType[] {
	return readFileSync(fixture.logPath, "utf8")
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line) as RecordType);
}

export async function claimRenderedWorkbenchLease(browser: AgentBrowserSession): Promise<void> {
	// A lease is an explicit transport precondition rather than a rendered human
	// control. Claim each one-shot command lease through the pane transport that
	// owns the controls under test; every actual command still comes from the UI.
	const lease = await browser.eval<{ kind: string; state: string }>(`(async () => {
		const frame = document.querySelector('[data-workbench-frame]');
		const key = frame && Object.keys(frame).find(candidate => candidate.startsWith('__reactFiber$'));
		let fiber = key ? frame[key] : null;
		for (let depth = 0; fiber && depth < 30; depth += 1, fiber = fiber.return) {
			const transport = fiber.memoizedProps?.view?.panes?.[0]?.transport;
			if (typeof transport?.claimLease === 'function') return transport.claimLease();
		}
		throw new Error('The rendered workbench exposed no pane transport for controlled lease setup.');
	})()`);
	expect(lease).toMatchObject({ kind: "command_lease", state: "active" });
}

export function workbenchControlOperability(
	browser: AgentBrowserSession,
	selector: string,
): Promise<WorkbenchControlOperability> {
	return browser.eval<WorkbenchControlOperability>(`(() => {
		const control = document.querySelector(${JSON.stringify(selector)});
		if (!(control instanceof HTMLButtonElement)) throw new Error('Missing rendered workbench control.');
		const rect = node => node?.getBoundingClientRect() ?? new DOMRect();
		const overlaps = (left, right) => left.width > 0 && left.height > 0 && right.width > 0 &&
			right.height > 0 && left.left < right.right && left.right > right.left &&
			left.top < right.bottom && left.bottom > right.top;
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
		const request = rect(document.querySelector('[data-workbench-region="app-global-request"]'));
		const requestOverlap = overlaps(bounds, request);
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
			requestOverlap,
			centerHit,
			operable: visibleWidth >= 44 && visibleHeight >= 44 && !clipped && !requestOverlap && centerHit,
		};
	})()`);
}
