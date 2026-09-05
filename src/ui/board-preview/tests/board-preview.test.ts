import { describe, expect, test } from "bun:test";

import type { BoardPreviewSnapshot, ServerElement } from "@/ui/types";
import { cleanElementForExcalidraw } from "@/ui/canvas/elements";
import {
	BoardPreviewCache,
	fingerprintMountedPreview,
	PreviewRequestGate,
	projectPreviewSnapshot,
} from "@/ui/board-preview";

type ServerRectangle = Extract<ServerElement, { type: "rectangle" }>;

/**
 * A complete rectangle as the server would send it.
 * @param id The element id.
 * @param overrides Fields that differ from the plain rectangle.
 * @returns A server element carrying runtime tracking.
 */
const rectangle = (id: string, overrides: Partial<ServerRectangle> = {}): ServerRectangle => {
	const base: ServerRectangle = {
		id,
		type: "rectangle",
		x: 0,
		y: 0,
		width: 10,
		height: 10,
		angle: 0,
		strokeColor: "#000000",
		backgroundColor: "transparent",
		fillStyle: "solid",
		strokeWidth: 1,
		strokeStyle: "solid",
		roughness: 0,
		opacity: 100,
		roundness: null,
		seed: 1,
		version: 1,
		versionNonce: 1,
		index: null,
		isDeleted: false,
		groupIds: [],
		frameId: null,
		boundElements: null,
		updated: 0,
		link: null,
		locked: false,
	};
	return { ...base, ...overrides };
};

describe("board preview cache", () => {
	test("bounds Blob URLs by identity, fingerprint and theme and revokes every replacement", () => {
		const revoked: string[] = [];
		const cache = new BoardPreviewCache(2, (url) => revoked.push(url));
		const light = { board: "alpha", fingerprint: "one", theme: "light" as const };
		const dark = { ...light, theme: "dark" as const };

		cache.put(light, "blob:light-one");
		cache.put(dark, "blob:dark-one");
		expect(cache.get(light)).toBe("blob:light-one");
		cache.put({ board: "beta", fingerprint: "one", theme: "light" }, "blob:beta");
		expect(revoked).toEqual(["blob:dark-one"]);

		cache.put({ ...light, fingerprint: "two" }, "blob:light-two");
		expect(cache.get(light)).toBeNull();
		expect(revoked).toEqual(["blob:dark-one", "blob:light-one"]);
		cache.clear();
		expect(cache.size).toBe(0);
		expect(revoked).toEqual(["blob:dark-one", "blob:light-one", "blob:beta", "blob:light-two"]);
	});

	test("rejects a completion once a later board disclosure begins", () => {
		const gate = new PreviewRequestGate();
		const first = gate.begin("alpha");
		const second = gate.begin("beta");
		expect(gate.accepts(first)).toBeFalse();
		expect(gate.accepts(second)).toBeTrue();
		gate.cancel();
		expect(gate.accepts(second)).toBeFalse();
	});
});

describe("board preview projection", () => {
	test("removes server tracking and deleted elements before Excalidraw export", () => {
		const snapshot: BoardPreviewSnapshot = {
			board: "alpha",
			fingerprint: "scene-one",
			files: {},
			elements: [
				rectangle("live", { createdAt: "server-only", source: "server-only" }),
				rectangle("gone", { isDeleted: true }),
			],
		};
		const projected = projectPreviewSnapshot(snapshot);
		expect(projected.elements.map((element) => element.id)).toEqual(["live"]);
		expect(projected.elements[0]).not.toHaveProperty("createdAt");
		expect(projected.elements[0]).not.toHaveProperty("source");
	});

	test("drops bindings and containers that point outside the update", () => {
		const snapshot: BoardPreviewSnapshot = {
			board: "alpha",
			fingerprint: "scene-two",
			files: {},
			elements: [
				rectangle("box", {
					boundElements: [
						{ id: "missing", type: "text" },
						{ id: "peer", type: "arrow" },
					],
				}),
				rectangle("peer", { boundElements: [{ id: "absent", type: "arrow" }] }),
			],
		};
		const [box, peer] = projectPreviewSnapshot(snapshot).elements;
		expect(box?.boundElements).toEqual([{ id: "peer", type: "arrow" }]);
		expect(peer?.boundElements).toBeNull();
	});

	test("fingerprints mounted element and file content rather than pane identity", async () => {
		const scene = {
			board: "alpha",
			elements: [cleanElementForExcalidraw(rectangle("shape", { versionNonce: 1 }))],
			files: {},
		};
		const first = await fingerprintMountedPreview(scene);
		const same = await fingerprintMountedPreview({ ...scene, board: "renamed-in-controller" });
		const changed = await fingerprintMountedPreview({
			...scene,
			elements: [cleanElementForExcalidraw(rectangle("shape", { versionNonce: 2 }))],
		});
		expect(same).toBe(first);
		expect(changed).not.toBe(first);
		expect(first).toHaveLength(64);
	});
});
