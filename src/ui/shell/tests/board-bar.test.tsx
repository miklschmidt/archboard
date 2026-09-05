import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { BoardBar } from "../BoardBar.js";
import type { BoardHold, LockHolder } from "../../types/index.js";

const claimedBy: LockHolder = {
	id: "diagram-agent",
	kind: "agent",
	since: "2026-09-05T10:00:00Z",
	until: "2026-09-05T11:00:00Z",
	process: "test",
	claimed: true,
	reason: "Restructuring payments",
};
const hold: BoardHold = {
	board: "payments",
	since: "2026-09-05T10:00:00Z",
	writes: 2,
	fromScreen: true,
	message: "The note changed on disk.",
	conflict: {
		board: "payments",
		file: "payments.md",
		reason: "changed",
		message: "The note changed on disk.",
		outcomes: { reload: "Reload", overwrite: "Overwrite", saveAs: "Save elsewhere" },
	},
};
function noop(): void {}

test("keeps save recovery and board ownership visible at the same time", () => {
	const markup = renderToStaticMarkup(
		<BoardBar
			identity={null}
			boardKey="payments"
			connected
			claimedBy={claimedBy}
			hold={hold}
			writtenElsewhere={null}
			onHoldClick={noop}
			onNoteClick={noop}
			paneCount={1}
			onOpen={noop}
			onClear={noop}
			onOpenOpenerSettings={noop}
			onAddPane={noop}
			onClosePane={noop}
			theme="light"
			onThemeChange={noop}
			busy={false}
		/>,
	);
	expect(markup).toMatch(/<button[^>]*chip-held[^>]*>not saving · 2 changes held<\/button>/u);
	expect(markup).toContain('aria-label="Board ownership"');
	expect(markup).toContain("Claimed by");
	expect(markup).toContain("diagram-agent");
	expect(markup).not.toContain("In the vault");
});
