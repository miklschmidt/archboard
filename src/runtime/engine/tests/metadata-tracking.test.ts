import { expect, test } from "bun:test";

import { architectureFacts } from "../../board-inspection/architecture.js";
import { compareBoards } from "../compare.js";
import { describeScene } from "../describe.js";
import {
	hydrateElementTracking,
	packElementTracking,
	readElementMetadata,
	semanticElementProjection,
} from "../metadata.js";
import type { ServerElement } from "../types.js";
import { completeElement } from "./support/elements.js";

const identity = { board: "tracking", variant: "current" as const };
const base = () =>
	completeElement({
		id: "tracked",
		type: "rectangle",
		x: 10,
		y: 20,
		width: 100,
		height: 50,
		customData: { archboard: { node: "api", kind: "service" }, foreign: "kept" },
	});

function withTracking(element: ServerElement): ServerElement {
	return {
		...element,
		createdAt: "legacy-created",
		updatedAt: "legacy-updated",
		syncedAt: "legacy-synced",
		source: "frontend_sync",
		syncTimestamp: "legacy-sync",
		customData: {
			...element.customData,
			archboard: {
				...element.customData?.archboard,
				createdAt: "canonical-created",
				updatedAt: "canonical-updated",
				syncedAt: "canonical-synced",
				source: "canonical-source",
				syncTimestamp: "canonical-sync",
			},
		},
	};
}

test("tracking packs and hydrates immutably while semantic readers cannot observe it", () => {
	const plain = base();
	const tracked = withTracking(plain);
	const before = structuredClone(tracked);
	const hydrated = hydrateElementTracking(tracked);
	expect(hydrated).toMatchObject({
		createdAt: "canonical-created",
		updatedAt: "canonical-updated",
		syncedAt: "canonical-synced",
		source: "canonical-source",
		syncTimestamp: "canonical-sync",
	});
	const packed = packElementTracking(hydrated);
	expect(packed).not.toHaveProperty("source");
	expect(packed.customData?.archboard).toMatchObject({
		node: "api",
		kind: "service",
		source: "canonical-source",
	});
	expect(tracked).toEqual(before);
	expect(readElementMetadata(tracked).archboard).toEqual({ node: "api", kind: "service" });

	const semantic = semanticElementProjection(tracked);
	expect(semantic).not.toHaveProperty("source");
	expect(semantic.customData?.archboard).toEqual({ node: "api", kind: "service" });
	expect(describeScene([tracked])).toBe(describeScene([plain]));
	expect(architectureFacts([tracked])).toEqual(architectureFacts([plain]));
	expect(
		compareBoards(
			{ key: "tracking", identity, elements: [plain], source: "memory" },
			{ key: "tracking", identity, elements: [tracked], source: "memory" },
		),
	).toEqual(
		compareBoards(
			{ key: "tracking", identity, elements: [plain], source: "memory" },
			{ key: "tracking", identity, elements: [plain], source: "memory" },
		),
	);
});
