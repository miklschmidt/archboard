import { describe, expect, test } from "bun:test";

import type { BoardPreviewSnapshot } from "../../types";
import {
	BoardPreviewCache,
	fingerprintMountedPreview,
	PreviewRequestGate,
	projectPreviewSnapshot,
} from "../index";

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
		const snapshot = {
			board: "alpha",
			fingerprint: "scene-one",
			files: {},
			elements: [
				{
					id: "live",
					type: "rectangle",
					isDeleted: false,
					createdAt: "server-only",
					source: "server-only",
				},
				{ id: "gone", type: "rectangle", isDeleted: true },
			],
		} as unknown as BoardPreviewSnapshot;
		const projected = projectPreviewSnapshot(snapshot);
		expect(projected.elements.map((element) => element.id)).toEqual(["live"]);
		expect(projected.elements[0]).not.toHaveProperty("createdAt");
		expect(projected.elements[0]).not.toHaveProperty("source");
	});

	test("fingerprints mounted element and file content rather than pane identity", async () => {
		const scene = {
			board: "alpha",
			elements: [{ id: "shape", version: 1 }] as never,
			files: {},
		};
		const first = await fingerprintMountedPreview(scene);
		const same = await fingerprintMountedPreview({ ...scene, board: "renamed-in-controller" });
		const changed = await fingerprintMountedPreview({
			...scene,
			elements: [{ id: "shape", version: 2 }] as never,
		});
		expect(same).toBe(first);
		expect(changed).not.toBe(first);
		expect(first).toHaveLength(64);
	});
});
