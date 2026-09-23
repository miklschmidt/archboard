import { readFileSync } from "node:fs";

import type { ProductionFixture } from "../../canvas-state/support/codex-production.ts";
import type { AgentBrowserSession } from "./agent-browser.ts";

interface WorkbenchControlOperability {
	readonly width: number;
	readonly height: number;
	readonly visibleWidth: number;
	readonly visibleHeight: number;
	readonly clipped: boolean;
	/** An undersized control's 24px circle reaches another target (WCAG 2.5.8 spacing). */
	readonly crowded: boolean;
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
		// WCAG 2.5.8: a target under 24px passes when a 24px circle on its centre
		// reaches no other target, nor another undersized target's circle.
		const undersized = box => box.width < 24 || box.height < 24;
		const centre = box => [box.left + box.width / 2, box.top + box.height / 2];
		const [cx, cy] = centre(bounds);
		const crowded = undersized(bounds) && [...document.querySelectorAll(
			'a[href], button, input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])',
		)].some(other => {
			if (other.contains(control) || control.contains(other)) return false;
			const box = rect(other);
			if (box.width === 0 || box.height === 0) return false;
			const dx = cx - Math.max(box.left, Math.min(cx, box.right));
			const dy = cy - Math.max(box.top, Math.min(cy, box.bottom));
			if (Math.hypot(dx, dy) < 12) return true;
			const [ox, oy] = centre(box);
			return undersized(box) && Math.hypot(cx - ox, cy - oy) < 24;
		});
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
			crowded,
			centerHit,
			operable: !clipped && !crowded && centerHit,
		};
	})()`);
}

export { type WorkbenchControlOperability, productionFixtureRecords, workbenchControlOperability };
