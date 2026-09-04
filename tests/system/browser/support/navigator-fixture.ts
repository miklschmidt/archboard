import { expect } from "bun:test";
import type { createJsonRequester } from "../../boards/support/http.ts";
type Requester = ReturnType<typeof createJsonRequester>;
export async function createBoard(
	request: Requester,
	board: string,
	options: { save?: boolean; variant?: string } = {},
): Promise<string> {
	const key = options.variant ? `${board}@${options.variant}` : board;
	expect(
		(
			await request("/api/boards/new", {
				method: "POST",
				body: { board, variant: options.variant, level: "service" },
			})
		).status,
	).toBe(200);
	if (options.save !== false) {
		expect(
			(await request("/api/boards/save", { method: "POST", body: { board: key } })).status,
		).toBe(200);
	}
	return key;
}
export async function addBox(
	request: Requester,
	board: string,
	id: string,
	label: string,
): Promise<void> {
	expect(
		(
			await request(`/api/elements?board=${encodeURIComponent(board)}`, {
				method: "POST",
				body: {
					id,
					type: "rectangle",
					x: 40,
					y: 60,
					width: 240,
					height: 120,
					backgroundColor: "#dbe4ff",
					label: { text: label },
				},
			})
		).status,
	).toBe(200);
}
