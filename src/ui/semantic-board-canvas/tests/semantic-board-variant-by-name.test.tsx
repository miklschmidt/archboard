// A pane that draws in its page and shows one variant of a board redraws when
// that variant is edited, whichever way the pane names the variant (TASK-353).
//
// What this catches: a pane opened on `board@<variant name>` that has been told
// the board moved and still shows the old version, while the same pane opened
// by the variant's id, or on the current variant, draws the new one.

import { act } from "@testing-library/react";
import { afterAll, beforeAll, expect, test } from "bun:test";

import { DEFAULT_SEMANTIC_POLICY } from "@/shared/semantic-policy/index";
import { pictureSource, takePicturesFrom } from "@/ui/semantic-board-canvas/lib/picture-source";
import {
	announceSemanticBoardChange,
	createLocalPictureSource,
	type DrawBoard,
} from "@/ui/semantic-board-canvas/index";
import {
	drawing,
	mountStage,
	part,
	server,
	settle,
} from "@/ui/semantic-board-canvas/tests/stage-harness";

const serverSource = pictureSource();

/** Draws a blank picture of the version it was handed, of the variant it was asked for by id or by name. */
const draw: DrawBoard = (board, choices) => {
	const shown =
		board.variants.find((one) => one.id === choices.variant || one.name === choices.variant) ??
		board.variants.find((one) => one.id === board.current);
	return Promise.resolve({
		ok: true,
		reply: {
			...drawing(board.version),
			variant: { id: shown?.id ?? "v1", name: shown?.name ?? "state", lifecycle: "current" },
		},
	} as Awaited<ReturnType<DrawBoard>>);
};

beforeAll(() => {
	takePicturesFrom(createLocalPictureSource({ draw, renderer: "test", storage: undefined }));
});
afterAll(() => {
	takePicturesFrom(serverSource);
});

/**
 * The board at one version: the current architecture, and a proposal with a name.
 * @param version The version.
 * @returns The document.
 */
function board(version: number): Record<string, unknown> {
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
	server.documents["pipeline"] = board(1);
	mountStage(null, { variant });
	await settle();
	const shown = (): string | null => part("semantic-board-stage").getAttribute("data-version");
	const before = shown();
	server.documents["pipeline"] = board(2);
	act(() => announceSemanticBoardChange("pipeline", 2));
	await settle();
	await settle();
	return [before, shown()];
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
