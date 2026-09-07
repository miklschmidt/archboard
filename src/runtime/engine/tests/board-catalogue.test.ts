import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readBoardCatalogue, watchBoardCatalogue } from "../board-catalogue.js";

test("catalogue watches unopened nested board and variant creation and deletion", async () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-catalogue-"));
	const nested = path.join(root, "systems");
	fs.mkdirSync(nested);
	let next: (() => void) | null = null;
	let fail: ((error: Error) => void) | null = null;
	const stop = watchBoardCatalogue(
		() => next?.(),
		(error) => fail?.(error),
		root,
	);
	const change = (mutate: () => void, accepts: (text: string) => boolean) =>
		new Promise<void>((resolve, reject) => {
			fail = reject;
			next = () => {
				if (accepts(readBoardCatalogue(root))) resolve();
			};
			mutate();
		});
	try {
		expect(JSON.parse(readBoardCatalogue(root))).toEqual({
			type: "archboard_board_catalogue",
			boards: [],
			omitted: 0,
		});
		const current = path.join(nested, "payments.excalidraw.md");
		const variant = path.join(nested, "payments@proposed.excalidraw.md");
		await change(
			() => {
				fs.writeFileSync(current, "");
				fs.writeFileSync(variant, "");
			},
			(text) => text.includes("proposed"),
		);
		expect(JSON.parse(readBoardCatalogue(root)).boards).toEqual([
			{ key: "systems/payments", board: "systems/payments", variant: "current" },
			{ key: "systems/payments@proposed", board: "systems/payments", variant: "proposed" },
		]);
		await change(
			() => fs.unlinkSync(variant),
			(text) => !text.includes("proposed"),
		);
		expect(JSON.parse(readBoardCatalogue(root)).boards).toHaveLength(1);
	} finally {
		stop();
		fs.rmSync(root, { recursive: true, force: true });
	}
}, 2000);
