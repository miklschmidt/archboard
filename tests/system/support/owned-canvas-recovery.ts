import { TEST_CANVAS_HEALTH_REQUEST_TIMEOUT_MS } from "./timing.ts";

async function discardHeldBoards(
	generation: Readonly<{ base: string; pid: number; exit: object | null }>,
): Promise<void> {
	if (generation.exit !== null) {
		return;
	}
	let response: Response;
	try {
		response = await fetch(`${generation.base}/health`, {
			signal: AbortSignal.timeout(TEST_CANVAS_HEALTH_REQUEST_TIMEOUT_MS),
		});
	} catch {
		return;
	}
	if (!response.ok) {
		return;
	}
	const health: unknown = await response.json();
	if (health === null || typeof health !== "object" || !("pid" in health)) {
		return;
	}
	if (health.pid !== generation.pid) {
		return;
	}
	const heldBoards = "held_boards" in health ? health.held_boards : undefined;
	if (heldBoards !== undefined && !Array.isArray(heldBoards)) {
		throw new TypeError("Canvas health returned non-array held-board evidence.");
	}
	const discardAt = async (index: number): Promise<void> => {
		const hold: unknown = heldBoards?.[index];
		if (hold === undefined) {
			return;
		}
		if (
			hold === null ||
			typeof hold !== "object" ||
			!("board" in hold) ||
			typeof hold.board !== "string"
		) {
			throw new Error("Canvas health returned a held board without a string board identity.");
		}
		const recovery = await fetch(
			`${generation.base}/api/boards/open?doing=${encodeURIComponent("disposing the test-owned canvas")}`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ board: hold.board, reload: true }),
				signal: AbortSignal.timeout(TEST_CANVAS_HEALTH_REQUEST_TIMEOUT_MS),
			},
		);
		if (!recovery.ok) {
			throw new Error(
				`Could not discard held board ${JSON.stringify(hold.board)} before test canvas disposal: HTTP ${recovery.status}.`,
			);
		}
		await discardAt(index + 1);
	};
	await discardAt(0);
}

export { discardHeldBoards };
