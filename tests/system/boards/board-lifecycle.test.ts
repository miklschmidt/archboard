import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
	boardDisplayName,
	boardKey,
	identityFrontmatter,
	listBoards,
	makeIdentity,
	normalizeBoardKey,
	parseBoardKey,
	vaultPathFor,
} from "../../../src/runtime/engine/board.ts";
import { readBoardFile } from "../../../src/runtime/engine/board-io.ts";
import { boards as boardStore, getOrCreateBoard } from "../../../src/runtime/engine/board-store.ts";
import { startOwnedCanvas, type OwnedCanvas } from "../support/owned-canvas.ts";
import { createJsonRequester } from "./support/http.ts";

interface BoardIdentity {
	board: string;
	variant: string;
	level?: string;
	displayName?: string;
}

interface BoardSummary {
	key: string;
	file?: string;
	identity?: BoardIdentity;
	placeholder?: boolean;
	elementCount?: number;
	loadedAt?: string;
}

interface BoardsBody {
	boards: BoardSummary[];
	open: BoardSummary[];
}

interface BoardBody extends BoardSummary {
	board: string;
	pane: unknown;
	source?: string;
	declaredKey?: string;
	error?: string;
}

interface ElementsBody {
	count: number;
	elements: Array<{
		id: string;
		x?: number;
		customData?: { archboard?: { kind?: string } };
	}>;
}

interface SnapshotBody {
	name?: string;
	error?: string;
}

const repoRoot = path.resolve(import.meta.dir, "../../..");
const vault = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-board-lifecycle-"));
let canvas: OwnedCanvas;
let request: ReturnType<typeof createJsonRequester>;

beforeAll(async () => {
	canvas = await startOwnedCanvas({
		serverPath: path.join(repoRoot, "src/server.ts"),
		vault,
	});
	request = createJsonRequester(canvas);
});

afterAll(async () => {
	await canvas?.dispose();
});

describe("board lifecycle", () => {
	test("normalizes identity while preserving the spoken display name", () => {
		expect(makeIdentity({ board: "Payments" }).board).toBe("payments");
		expect(boardKey(parseBoardKey("Payments"))).toBe(boardKey(parseBoardKey("payments")));
		expect(boardDisplayName(parseBoardKey("Payments"))).toBe("Payments");
		expect(parseBoardKey("payments").displayName).toBeUndefined();
		expect(boardKey(parseBoardKey("payments@Option-A"))).toBe("payments@option-a");
		expect(boardKey(parseBoardKey("Billing/Ledger"))).toBe("billing/ledger");
		expect(normalizeBoardKey("café")).toBe(normalizeBoardKey("café"));
		expect(boardKey(parseBoardKey("café"))).toBe(boardKey(parseBoardKey("café")));
		expect(
			identityFrontmatter(makeIdentity({ board: "Payments" })).find(
				([key]) => key === "board",
			)?.[1],
		).toBe("Payments");
	});

	test("resolves existing note casing and reports collisions deterministically", () => {
		const caseVault = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-case-"));
		try {
			const note =
				'---\nboard: Payments\nvariant: current\n---\n\n# Excalidraw Data\n\n## Text Elements\n\n%%\n## Drawing\n```json\n{"type":"excalidraw","version":2,"elements":[],"appState":{}}\n```\n%%\n';
			fs.writeFileSync(path.join(caseVault, "Payments.excalidraw.md"), note);
			expect(vaultPathFor(parseBoardKey("payments"), caseVault)).toBe(
				path.join(caseVault, "Payments.excalidraw.md"),
			);
			const readWithLowercaseAddress = readBoardFile(parseBoardKey("payments"), caseVault);
			expect(readWithLowercaseAddress?.identity.displayName).toBe("Payments");
			expect(readWithLowercaseAddress?.declaredKey).toBeUndefined();
			expect(vaultPathFor(parseBoardKey("NewBoard"), caseVault)).toBe(
				path.join(caseVault, "NewBoard.excalidraw.md"),
			);
			const decomposed = "café";
			fs.writeFileSync(
				path.join(caseVault, `${decomposed}.excalidraw.md`),
				note.replace("Payments", "café"),
			);
			expect(vaultPathFor(parseBoardKey("café"), caseVault)).toBe(
				path.join(caseVault, `${decomposed}.excalidraw.md`),
			);
			fs.writeFileSync(
				path.join(caseVault, "payments.excalidraw.md"),
				note.replaceAll("Payments", "payments"),
			);
			const collided = listBoards(caseVault).filter((board) => board.key === "payments");
			expect(collided).toHaveLength(2);
			expect(collided.every((board) => board.collidesWith?.length === 1)).toBeTrue();
			expect(vaultPathFor(parseBoardKey("payments"), caseVault)).toBe(
				vaultPathFor(parseBoardKey("PAYMENTS"), caseVault),
			);
		} finally {
			fs.rmSync(caseVault, { recursive: true, force: true });
		}
	});

	test("creates, lists, opens and reloads one note-backed board", async () => {
		const created = await request<BoardBody>("/api/boards/new", {
			method: "POST",
			body: { board: "CaseTest", level: "service" },
		});
		expect(created.status).toBe(200);
		expect(created.body).toMatchObject({
			board: "casetest",
			pane: null,
			identity: { board: "casetest", level: "service", displayName: "CaseTest" },
		});
		expect(path.basename(created.body.file ?? "")).toBe("CaseTest.excalidraw.md");

		const otherSpelling = await request("/api/elements?board=casetest", {
			method: "POST",
			body: { id: "shape", type: "rectangle", x: 0, y: 0, width: 40, height: 40 },
		});
		expect([200, 201]).toContain(otherSpelling.status);
		const underAnotherSpelling = await request<ElementsBody>("/api/elements?board=CASETEST");
		expect(underAnotherSpelling.body).toMatchObject({ count: 1 });

		const saved = await request<BoardBody>("/api/boards/save?board=CaseTest", { method: "POST" });
		expect(saved.status).toBe(200);
		expect(
			fs.readdirSync(vault).filter((file) => /^casetest\.excalidraw\.md$/i.test(file)),
		).toHaveLength(1);
		expect(fs.readFileSync(saved.body.file ?? "", "utf8")).toMatch(/^board: CaseTest$/m);

		const listing = await request<BoardsBody>("/api/boards");
		expect(listing.body.open.some((board) => board.key === "casetest")).toBeTrue();
		expect(listing.body.boards.filter((board) => board.key === "casetest")).toHaveLength(1);

		const duplicate = await request<BoardBody>("/api/boards/new", {
			method: "POST",
			body: { board: "casetest", level: "service" },
		});
		expect(duplicate.status).toBe(409);
		expect(duplicate.body.error).toMatch(/already open|already exists/);

		fs.writeFileSync(
			path.join(vault, "Handover.excalidraw.md"),
			'---\nboard: Handover\nvariant: current\n---\n\n# Excalidraw Data\n\n%%\n## Drawing\n```json\n{"type":"excalidraw","version":2,"elements":[],"appState":{}}\n```\n%%\n',
		);
		const startedOver = await request<BoardBody>("/api/boards/new", {
			method: "POST",
			body: { board: "handover" },
		});
		expect(startedOver.status).toBe(409);
		expect(startedOver.body.error).toMatch(/Handover\.excalidraw\.md/);
		const openedLower = await request<BoardBody>("/api/boards/open", {
			method: "POST",
			body: { board: "handover" },
		});
		expect(openedLower.status).toBe(200);
		expect(path.basename(openedLower.body.file ?? "")).toBe("Handover.excalidraw.md");
		expect(openedLower.body.declaredKey).toBeUndefined();

		const notePath = created.body.file!;
		const note = fs.readFileSync(notePath, "utf8");
		fs.writeFileSync(notePath, note.replace('"width": 40', '"width": 72'));
		const liveRead = await request<ElementsBody>("/api/elements?board=casetest");
		expect(liveRead.body.elements[0]?.x).toBe(0);
		expect(fs.readFileSync(notePath, "utf8")).toContain('"width": 72');
		const reloaded = await request<BoardBody>("/api/boards/open", {
			method: "POST",
			body: { board: "casetest", reload: true },
		});
		expect(reloaded.status).toBe(200);
	});

	test("keeps registry entries free of board content", () => {
		const { board } = getOrCreateBoard(
			makeIdentity({ board: "registry-entry-shape", level: "service" }),
		);
		const fields = Object.keys(board).toSorted();
		expect("elements" in board).toBeFalse();
		expect("files" in board).toBeFalse();
		expect("note" in board).toBeFalse();
		expect(
			fields.every((field) =>
				["identity", "file", "baseline", "loadedAt", "savedAt"].includes(field),
			),
		).toBeTrue();
		boardStore.delete("registry-entry-shape");
	});

	test("keeps the registry content-free by reading note changes per request", async () => {
		const created = await request<BoardBody>("/api/boards/new", {
			method: "POST",
			body: { board: "registry-shape" },
		});
		await request("/api/elements?board=registry-shape", {
			method: "POST",
			body: { id: "r1", type: "rectangle", x: 0, y: 0, width: 120, height: 50 },
		});
		const file = created.body.file!;
		fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("120", "321"));
		const reread = await request<{ elements: Array<{ width: number }> }>(
			"/api/elements?board=registry-shape",
		);
		expect(reread.body.elements[0]?.width).toBe(321);
	});

	test("snapshots stay isolated from later board writes", async () => {
		await request("/api/boards/new", { method: "POST", body: { board: "snapshot-sharing" } });
		await request("/api/elements?board=snapshot-sharing", {
			method: "POST",
			body: {
				id: "s1",
				type: "rectangle",
				x: 0,
				y: 0,
				width: 160,
				height: 80,
				customData: { archboard: { node: "api", kind: "gateway", variant: "current" } },
			},
		});
		const taken = await request<SnapshotBody>("/api/snapshots?board=snapshot-sharing", {
			method: "POST",
			body: { name: "before-the-split" },
		});
		expect(taken.status).toBe(200);
		const beforeUpdate = await request<{
			snapshot: { elements: ElementsBody["elements"] };
		}>("/api/snapshots/before-the-split");
		expect(
			beforeUpdate.body.snapshot.elements.find((element) => element.id === "s1")?.customData
				?.archboard?.kind,
		).toBe("gateway");
		await request("/api/elements/s1?board=snapshot-sharing", {
			method: "PUT",
			body: {
				id: "s1",
				type: "rectangle",
				x: 999,
				y: 0,
				width: 160,
				height: 80,
				customData: { archboard: { node: "api", kind: "datastore", variant: "current" } },
			},
		});
		const snapshot = await request<{ snapshot: { elements: ElementsBody["elements"] } }>(
			"/api/snapshots/before-the-split",
		);
		const snapshotElement = snapshot.body.snapshot.elements.find((element) => element.id === "s1");
		expect(snapshotElement?.x).toBe(0);
		expect(snapshotElement?.customData?.archboard?.kind).toBe("gateway");
		const changedBoard = await request<ElementsBody>("/api/elements?board=snapshot-sharing");
		expect(changedBoard.body.elements.find((element) => element.id === "s1")?.x).toBe(999);
	});
});
