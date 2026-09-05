import { expect } from "bun:test";
import type { createJsonRequester } from "../../boards/support/http.ts";

type Requester = ReturnType<typeof createJsonRequester>;
async function createBoard(
	request: Readonly<Requester> & Requester,
	board: string,
	options: Readonly<{ save?: boolean; variant?: string }> = {},
): Promise<string> {
	const key =
		options.variant === undefined || options.variant.length === 0
			? board
			: `${board}@${options.variant}`;
	const created = await request("/api/boards/new", {
		method: "POST",
		body: { board, variant: options.variant, level: "service" },
	});
	expect(created.status).toBe(200);
	if (options.save !== false) {
		const saved = await request("/api/boards/save", { method: "POST", body: { board: key } });
		expect(saved.status).toBe(200);
	}
	return key;
}
async function addBox(
	request: Readonly<Requester> & Requester,
	board: string,
	id: string,
	label: string,
): Promise<void> {
	const added = await request(`/api/elements?board=${encodeURIComponent(board)}`, {
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
	});
	expect(added.status).toBe(200);
}

export { addBox, createBoard };
