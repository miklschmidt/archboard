import fs from "node:fs";

import { z } from "zod";

import { CliUsageError, defineCommand } from "@/cli/command-contract/contract";
import { PendingArtifactSchema } from "@/cli/command-contract/schemas";
import { boardRequiredRefusal, serverRefusal } from "@/cli/command-contract/refusals";
import {
	InspectionOptionsInputSchema,
	inspectionOptionParameters,
	inspectionPolicyOf,
} from "@/cli/inspection-policy/index";
import { currentRequestedBoard, exportFindings } from "@/runtime/engine/canvas-client";
import {
	assembleFindingArtifacts,
	FindingRenderManifestSchema,
} from "@/cli/finding-rendering/index";

const RenderFindingsInputSchema = InspectionOptionsInputSchema.extend({
	out: z.string().min(1, "render-findings requires --out <existing-empty-directory>"),
	tail: z.array(z.string()).default([]),
});

function requireEmptyDirectory(directory: string): void {
	let stat: fs.Stats;
	try {
		stat = fs.statSync(directory);
	} catch {
		throw new CliUsageError(`--out must name an existing empty directory: ${directory}`);
	}
	if (!stat.isDirectory() || fs.readdirSync(directory).length > 0) {
		throw new CliUsageError(`--out must name an existing empty directory: ${directory}`);
	}
}

const renderFindingsContract = defineCommand({
	path: ["render-findings"],
	summary: "Render deterministic PNG close-ups for persisted board findings",
	usage: [
		"render-findings --board <key> --out <existing-empty-directory>",
		"                [--font-family <family>] [--dimension-tolerance <px>]",
		"                [--intersection-tolerance <px>] [--overlap-tolerance <px>]",
	].join("\n"),
	description:
		"Inspects one named note snapshot, renders its finding focus boxes in the server-owned renderer, and commits validated PNGs plus manifest.json.",
	examples: ["archboard render-findings --board payments --out ./finding-renders"],
	parameters: [
		{
			kind: "option",
			key: "out",
			spellings: ["--out"],
			value: "required",
			description: "Existing empty output directory",
		},
		...inspectionOptionParameters,
		{
			kind: "positional",
			key: "tail",
			name: "extra",
			repeatable: true,
			description: "Unexpected positional arguments",
		},
	],
	input: { ingress: RenderFindingsInputSchema },
	result: FindingRenderManifestSchema,
	output: {
		cases: [
			{
				id: "manifest",
				when: {},
				mode: "file-receipt",
				held: "none",
				description: "Schema-v3 validated manifest after every artifact commits",
				presentation: ["result"],
				artifact: PendingArtifactSchema,
			},
		],
		select: () => "manifest",
	},
	prerequisites: ["server", "board"],
	effects: ["read", "local-read", "local-write"],
	refusals: [boardRequiredRefusal, serverRefusal],
	relationships: [
		{
			method: "POST",
			path: "/api/export/findings",
			cardinality: "one",
			description: "One correlated persisted-snapshot finding export",
		},
	],
	async handler(input, context) {
		if (input.tail.length > 0) {
			throw new CliUsageError("render-findings takes no positional arguments");
		}
		const board = currentRequestedBoard();
		if (board === null || board.length === 0) {
			throw new CliUsageError("render-findings requires --board <key>");
		}
		const out = context.resolvePath(input.out);
		requireEmptyDirectory(out);
		const policy = inspectionPolicyOf(input);
		await context.require("server", "Rendering board findings");
		const rendered = await exportFindings(policy);
		const { manifest, artifact } = assembleFindingArtifacts(rendered, out);
		return { result: manifest, pendingArtifact: artifact };
	},
});

export { RenderFindingsInputSchema, renderFindingsContract };
