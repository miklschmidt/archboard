// A pane that draws in its page and shows one variant of a board redraws when
// that variant is edited, whichever way the pane names the variant (TASK-353).
//
// What this catches: a pane opened on `board@<variant name>` that has been told
// the board moved and still shows the old version, while the same pane opened
// by the variant's id, or on the current variant, draws the new one.

import { act } from "@testing-library/react";
import { beforeAll, expect, test } from "bun:test";

import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";
import { announceSemanticBoardChange } from "#ui/state/semantic-board-canvas/board-changes.ts";
import {
	createLocalPictureSource,
	type DrawBoard,
} from "#ui/clients/semantic-board-canvas/reads/local-pictures.ts";
import { takePicturesFrom } from "#ui/clients/semantic-board-canvas/reads/picture-source.ts";
import {
	PANE_VAULT,
	mountStage,
	part,
	server,
	settle,
} from "#tests/ui/support/semantic-board-canvas/stage-harness.tsx";

/**
 * Draw a blank picture of the board's version, of the variant asked for by id or by name.
 * @param document The board as the page read it.
 * @param choices The variant and view asked for.
 * @returns The drawing, as the renderer would answer.
 */
const draw: DrawBoard = (document, choices) => {
	const shown =
		document.variants.find((one) => one.id === choices.variant || one.name === choices.variant) ??
		document.variants.find((one) => one.id === document.current);
	return Promise.resolve({
		ok: true,
		reply: {
			success: true,
			board: document.name,
			version: document.version,
			variant: { id: shown?.id ?? "v1", name: shown?.name ?? "state", lifecycle: "current" },
			view: null,
			views: [],
			changes: null,
			waiting: null,
			width: 400,
			height: 300,
			svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"></svg>`,
			atlas: { nodes: {}, edges: {}, regions: {} },
			appearances: [],
			key: null,
			drawn: { nodes: [], edges: [], flows: [], steps: [] },
		},
	});
};

beforeAll(() => {
	takePicturesFrom(createLocalPictureSource({ draw, renderer: "test", storage: undefined }));
});

/**
 * The board at one version: the current architecture, and a proposal with a name.
 * @param version The version.
 * @returns The document.
 */
function boardAt(version: number): Record<string, unknown> {
	const content = { nodes: [{ id: "n1", name: "board-io", kind: "module" }], edges: [] };
	return {
		schemaVersion: "2.0.0",
		kind: "semantic-board",
		id: "b1",
		name: "pipeline",
		level: "system",
		version,
		createdAt: "2026-09-11T00:00:00.000Z",
		updatedAt: "2026-09-11T00:00:00.000Z",
		views: [],
		current: "v1",
		variants: [
			{ id: "v1", name: "as it is", lifecycle: "current", content },
			{ id: "v2", name: "Queued writes", lifecycle: "draft", parent: "v1", content },
		],
	};
}

/**
 * The version the pane's stage says it draws.
 * @returns The version, or null before anything is drawn.
 */
function versionShown(): string | null {
	return part("semantic-board-stage").getAttribute("data-version");
}

/**
 * Open a pane on a variant, edit the board, and read the version the pane shows.
 * @param variant How the pane names its variant, or nothing for the current one.
 * @returns The versions shown before and after the edit.
 */
async function versionsAcrossAnEdit(
	variant: string | undefined,
): Promise<readonly [string | null, string | null]> {
	server.vault = {
		success: true,
		policy: DEFAULT_SEMANTIC_POLICY,
		configurationValid: true,
		configurationFile: ".archboard/config.yaml",
		fingerprint: "policy",
		diagnostics: [],
	};
	server.documents["pipeline"] = boardAt(1);
	mountStage(null, { variant });
	await settle();
	const before = versionShown();
	server.documents["pipeline"] = boardAt(2);
	act(() => announceSemanticBoardChange(PANE_VAULT, "pipeline", 2));
	await settle();
	await settle();
	return [before, versionShown()];
}

test("a pane on the current variant draws the new version when the board is edited", async () => {
	expect(await versionsAcrossAnEdit(undefined)).toEqual(["1", "2"]);
});

test("a pane on a variant by its id draws the new version when the board is edited", async () => {
	expect(await versionsAcrossAnEdit("v2")).toEqual(["1", "2"]);
});

test("a pane on a variant by its name draws the new version when the board is edited", async () => {
	expect(await versionsAcrossAnEdit("Queued writes")).toEqual(["1", "2"]);
});
