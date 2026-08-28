/// <reference types="bun" />

import { describe, expect, test } from "bun:test";
import type { BinaryFileData } from "@excalidraw/excalidraw/types";
import type { DataURL } from "@excalidraw/excalidraw/types";
import type { FileId } from "@excalidraw/excalidraw/element/types";

import * as reporting from "../change-reporting.ts";
import {
	hasPendingEdits,
	mergeIncomingDeletes,
	reportsSettled,
	userHasInteracted,
} from "../change-reporting.ts";
import { replaceCanvasFiles } from "../files.ts";
import { ReportingHarness, box, copy, initialScene } from "./support/change-reporting-harness.ts";

function imageFile(id: string, dataURL: string, created: number): BinaryFileData {
	return {
		id: id as FileId,
		dataURL: dataURL as DataURL,
		mimeType: "image/png",
		created,
	};
}

describe("public reporting state", () => {
	test("the module exposes only the reporting contracts used at runtime", () => {
		expect(Object.keys(reporting).toSorted()).toEqual(
			[
				"EMPTY_WITHHELD",
				"carryWithheld",
				"hasPendingEdits",
				"initialState",
				"mergeIncoming",
				"mergeIncomingDeletes",
				"needsFullReport",
				"reduce",
				"reportsSettled",
				"userHasInteracted",
			].toSorted(),
		);
	});

	test("a local immediate update marks interaction, applies once, and enters the report", () => {
		const harness = new ReportingHarness();
		harness.state = { ...harness.state, userInteracted: false };
		const converted = box("mermaid", 400);
		harness.dispatch({
			type: "local_update_requested",
			update: { elements: [...harness.scene, converted], captureUpdate: "immediately" },
		});
		expect(userHasInteracted(harness.state)).toBe(true);
		expect(harness.scene.some((element) => element.id === converted.id)).toBe(true);
		expect(harness.state.localEditCount).toBe(1);

		harness.dispatch({
			type: "immediate_report_requested",
			scene: copy(harness.scene),
			withheldIds: [],
		});
		expect(harness.server.requests[0]?.report.upserts).toContainEqual(
			expect.objectContaining({ id: converted.id }),
		);
	});

	test("settled state excludes scheduled, in-flight, and queued delivery", () => {
		const harness = new ReportingHarness();
		expect(reportsSettled(harness.state)).toBe(true);
		harness.edit("a", { x: 30 });
		expect(reportsSettled(harness.state)).toBe(false);
		harness.due();
		expect(reportsSettled(harness.state)).toBe(false);
		harness.accept();
		expect(reportsSettled(harness.state)).toBe(true);
	});

	test("pending detection preserves withheld and deletion rules", () => {
		const harness = new ReportingHarness();
		expect(hasPendingEdits(harness.state, harness.scene)).toBe(false);
		const moved = harness.scene.map((element) =>
			element.id === "a" ? { ...element, x: 12 } : element,
		);
		expect(hasPendingEdits(harness.state, moved)).toBe(true);
		expect(hasPendingEdits(harness.state, moved, ["a"])).toBe(false);
		expect(
			hasPendingEdits(
				harness.state,
				harness.scene.filter((element) => element.id !== "a"),
			),
		).toBe(true);
	});

	test("camera and selection changes with the same content stamp schedule nothing", () => {
		const harness = new ReportingHarness();
		const holds = harness.holdRequests;
		harness.dispatch({ type: "scene_changed", scene: copy(harness.scene) });
		harness.dispatch({ type: "scene_changed", scene: copy(harness.scene) });
		expect(harness.holdRequests).toBe(holds);
		expect(reportsSettled(harness.state)).toBe(true);
	});

	test("frontend source tags are bookkeeping while human upserts keep scene order", () => {
		const harness = new ReportingHarness();
		harness.scene = harness.scene.map((element) => ({ ...element, source: "frontend_sync" }));
		harness.dispatch({ type: "scene_changed", scene: copy(harness.scene) });
		expect(reportsSettled(harness.state)).toBe(true);

		harness.scene = harness.scene.map((element) => ({
			...element,
			x: Number(element.x) + 10,
			version: Number(element.version) + 1,
		}));
		harness.dispatch({ type: "scene_changed", scene: copy(harness.scene) });
		harness.due();
		expect(harness.server.requests[0]?.report.upserts.map((element) => element.id)).toEqual([
			"a",
			"b",
		]);
		expect(
			harness.server.requests[0]?.report.upserts.every((element) => element.source === undefined),
		).toBe(true);
	});
});

describe("file and incoming server frames", () => {
	test("a replacement file frame removes stale membership and replaces reused-id bytes", () => {
		const files: Record<string, BinaryFileData> = {
			"same-id": imageFile("same-id", "data:image/png;base64,b2xk", 1),
			stale: imageFile("stale", "data:image/png;base64,c3RhbGU=", 1),
		};
		let additiveCalls = 0;
		replaceCanvasFiles(
			{
				getFiles: () => files,
				addFiles: (incoming) => {
					additiveCalls += 1;
					for (const file of incoming) {
						if (!files[file.id]) files[file.id] = file;
					}
				},
			},
			[
				imageFile("same-id", "data:image/png;base64,bmV3", 2),
				imageFile("drawn", "data:image/png;base64,ZHJhd24=", 2),
			],
		);
		expect(additiveCalls).toBe(1);
		expect(files).toEqual({
			"same-id": imageFile("same-id", "data:image/png;base64,bmV3", 2),
			drawn: imageFile("drawn", "data:image/png;base64,ZHJhd24=", 2),
		});
	});

	test("incoming updates and deletes never overwrite a locally dirty id", () => {
		const harness = new ReportingHarness();
		harness.edit("a", { x: 70 });
		harness.applyServerElements([
			{ ...harness.server.document.find((element) => element.id === "a")!, x: 25 },
		]);
		harness.clock.advance(0);
		expect(harness.scene.find((element) => element.id === "a")?.x).toBe(70);
		expect(mergeIncomingDeletes(harness.scene, ["a"], harness.state.baseline)).toContainEqual(
			expect.objectContaining({ id: "a" }),
		);

		const deleted = new ReportingHarness();
		deleted.remove("a");
		deleted.applyServerElements([
			{ ...deleted.server.document.find((element) => element.id === "a")!, x: 25 },
		]);
		deleted.clock.advance(0);
		expect(deleted.scene.some((element) => element.id === "a")).toBe(false);
		deleted.due();
		expect(deleted.server.requests[0]?.report.deletes).toContain("a");
	});

	test("overlapping server updates retain ordered completion records", () => {
		const harness = new ReportingHarness();
		harness.applyServerElements([{ ...harness.scene[0]!, x: 5 }]);
		harness.applyServerElements([{ ...harness.scene[1]!, y: 5 }]);
		expect(harness.state.applyingServerUpdateCount).toBe(2);
		expect(harness.state.serverUpdateStamps).toHaveLength(2);
		harness.clock.advance(0);
		expect(harness.state.applyingServerUpdateCount).toBe(0);
		expect(harness.state.serverUpdateStamps).toHaveLength(0);
	});

	test("text ids normalize before the reducer sends their report", () => {
		const longId = "text-element-from-excalidraw";
		const harness = new ReportingHarness([
			...initialScene().slice(0, 1),
			{ id: longId, type: "text", text: "Name", x: 0, y: 100, version: 1 },
		]);
		harness.edit(longId, { text: "Changed" });
		harness.due();
		expect(harness.server.requests[0]?.report.upserts).toContainEqual(
			expect.objectContaining({ type: "text", id: expect.not.stringMatching(longId) }),
		);
		const id = harness.server.requests[0]?.report.upserts.find(
			(element) => element.type === "text",
		)?.id;
		expect(typeof id === "string" && id.length <= 8).toBe(true);
	});
});
