import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { BoardIdentity } from "../board.js";
import type * as ChangeFeedModule from "../change-feed.js";
import type * as StoreModule from "../board-store.js";
import type { ServerElement } from "../types.js";
import { completeElement } from "./support/elements.ts";

const priorSettleMs = process.env.ARCHBOARD_SETTLE_MS;
process.env.ARCHBOARD_SETTLE_MS = "60000";

let changeFeed: typeof ChangeFeedModule.changeFeed;
let copyElements: typeof StoreModule.copyElements;

const identity: BoardIdentity = { board: "payments", variant: "current", level: "service" };
const box = (id: string, x: number, y: number, node?: string, kind = "service") =>
	completeElement({
		id,
		type: "rectangle",
		x,
		y,
		width: 200,
		height: 100,
		...(node ? { customData: { archboard: { node, kind, name: node } } } : {}),
	});
const label = (id: string, containerId: string, text: string, x: number, y: number) =>
	completeElement({
		id,
		type: "text",
		x: x + 20,
		y: y + 40,
		width: 100,
		height: 20,
		text,
		containerId,
	});
const arrow = (id: string, from: string, to: string) =>
	completeElement({
		id,
		type: "arrow",
		x: 0,
		y: 0,
		width: 10,
		height: 10,
		points: [
			[0, 0],
			[10, 10],
		],
		startBinding: { elementId: from, focus: 0, gap: 0 },
		endBinding: { elementId: to, focus: 0, gap: 0 },
	});
const scene = (): ServerElement[] => [
	box("a", 0, 0, "gateway", "gateway"),
	label("al", "a", "Gateway", 0, 0),
	box("b", 300, 0, "auth"),
	label("bl", "b", "AuthService", 300, 0),
	box("c", 600, 0, "pg", "datastore"),
	label("cl", "c", "Postgres", 600, 0),
	arrow("e1", "a", "b"),
	arrow("e2", "b", "c"),
];
const flatMetadataBox = () =>
	completeElement({
		id: "flat",
		type: "rectangle",
		x: 0,
		y: 0,
		width: 200,
		height: 100,
		customData: { kind: "service", binding: { path: "src/flat.ts" }, path: "src/flat.ts" },
	});

beforeAll(async () => {
	({ changeFeed } = await import("../change-feed.js"));
	({ copyElements } = await import("../board-store.js"));
});

afterAll(() => {
	if (priorSettleMs === undefined) delete process.env.ARCHBOARD_SETTLE_MS;
	else process.env.ARCHBOARD_SETTLE_MS = priorSettleMs;
	expect(process.env.ARCHBOARD_SETTLE_MS).toBe(priorSettleMs);
});

describe("change feed", () => {
	test("flat metadata reaches the feed as an anonymous drawing", () => {
		let elements: ServerElement[] = [];
		const read = () => elements;
		changeFeed.reset("flat-metadata", identity, read);
		elements = [flatMetadataBox()];
		changeFeed.record("flat-metadata", identity, read, "human");
		const event = changeFeed.settle("flat-metadata");
		expect(event?.change.nodes.added[0]).toMatchObject({ anonymous: true });
		expect(event?.change.nodes.added[0]?.kind).toBeUndefined();
	});

	test("30 human updates settle once and a second settle is empty", () => {
		let elements = scene();
		const read = () => elements;
		changeFeed.reset("payments-drag", identity, read);
		for (let index = 1; index <= 30; index += 1) {
			elements = elements.map((element) => {
				const moved = structuredClone(element);
				if (moved.id === "b") moved.y = index * 50;
				if (moved.id === "bl") moved.y = index * 50 + 40;
				return moved;
			});
			changeFeed.record("payments-drag", identity, read, "human");
		}
		const event = changeFeed.settle("payments-drag");
		expect(event).toMatchObject({ mutations: 30, origin: "human" });
		expect(changeFeed.settle("payments-drag")).toBeNull();
	});

	test("cosmetic silence keeps the baseline for the next real event", () => {
		let elements = scene();
		const read = () => elements;
		changeFeed.reset("payments-baseline", identity, read);
		elements = elements.map((element) =>
			element.id === "a" ? { ...element, backgroundColor: "#ffc9c9" } : element,
		);
		changeFeed.record("payments-baseline", identity, read, "human");
		expect(changeFeed.settle("payments-baseline")).toBeNull();

		const cursorBefore = changeFeed.cursor;
		elements = elements.filter((element) => element.id !== "e1");
		changeFeed.record("payments-baseline", identity, read, "agent");
		const next = changeFeed.settle("payments-baseline");
		expect(next?.cursor).toBe(cursorBefore + 1);
		expect(next?.origin).toBe("agent");
	});

	test("baselines and copied nested fields do not share mutable state", () => {
		const live = scene();
		const read = () => live;
		changeFeed.reset("inplace", identity, read);
		const node = live.find((element) => element.id === "a");
		expect(node).toBeDefined();
		const archboard = (node?.customData?.archboard ?? {}) as Record<string, unknown>;
		archboard.kind = "datastore";
		changeFeed.record("inplace", identity, read, "agent");
		expect(changeFeed.settle("inplace")).not.toBeNull();

		const original = scene();
		original[0]!.boundElements = [{ id: "al", type: "text" }];
		const copy = copyElements(original);
		const originalArchboard = original[0]!.customData?.archboard as Record<string, unknown>;
		originalArchboard.kind = "queue";
		(original[0]!.boundElements as Array<{ id: string; type: "text" }>).push({
			id: "ghost",
			type: "text",
		});
		const copiedArchboard = copy[0]?.customData?.archboard as Record<string, unknown> | undefined;
		expect(copiedArchboard?.kind).toBe("gateway");
		expect(copy[0]?.boundElements).toHaveLength(1);
	});

	test("coalescing returns a net diff and rejects unreachable cursors", () => {
		let elements = scene();
		const read = () => elements;
		changeFeed.reset("payments-coalesce", identity, read);
		const start = changeFeed.cursor;

		elements = elements.map((element) =>
			element.id === "b"
				? { ...element, y: 1400 }
				: element.id === "bl"
					? { ...element, y: 1440 }
					: element,
		);
		changeFeed.record("payments-coalesce", identity, read, "human");
		changeFeed.settle("payments-coalesce");
		elements = elements.filter((element) => element.id !== "e1");
		changeFeed.record("payments-coalesce", identity, read, "agent");
		changeFeed.settle("payments-coalesce");

		const net = changeFeed.coalesce(start, "payments-coalesce");
		expect(net?.events).toHaveLength(2);
		expect(net?.change.significance).not.toBe("none");
		expect(changeFeed.coalesce(-999, "nonexistent-board")).toBeNull();
	});

	test("reset adopts a wholesale board as its baseline", () => {
		const elements = scene();
		changeFeed.reset("loaded", identity, () => elements);
		expect(changeFeed.settle("loaded")).toBeNull();
	});

	test("tracking-only changes emit no event or tracking value", () => {
		let elements = [box("tracked", 0, 0, "tracked")];
		const read = () => elements;
		changeFeed.reset("tracking-only", identity, read);
		elements = elements.map((element) =>
			Object.assign(structuredClone(element), {
				createdAt: "created",
				updatedAt: "updated",
				syncedAt: "synced",
				source: "frontend_sync",
				syncTimestamp: "sync",
			}),
		);
		changeFeed.record("tracking-only", identity, read, "human");
		expect(changeFeed.settle("tracking-only")).toBeNull();
	});
});
