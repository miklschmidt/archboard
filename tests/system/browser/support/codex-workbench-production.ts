import { expect } from "bun:test";
import { readFileSync } from "node:fs";

import type { ProductionFixture } from "../../canvas-state/support/codex-production.ts";
import type { AgentBrowserSession } from "./agent-browser.ts";

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
