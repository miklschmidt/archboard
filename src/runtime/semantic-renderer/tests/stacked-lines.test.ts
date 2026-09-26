// Two lines with no card in common must never share one stroke: drawn on one
// coordinate they read as one line, and a trunk joining sources to the wrong
// targets. Cards one routing gap apart leave room for one line between them.
// A finishing routing that cured a hook and parted such a pair was refused
// because one of its lines took a bend more, although the routing saved a
// crossing (Browser application's "Recording a walkthrough").
// What this catches: the Graphviz engine leaving two unrelated lines in such
// a gap when both turn into it from the cards on either side, and refusing a
// finishing routing that saves a crossing for one bend more.

import { expect, test } from "bun:test";
import { SemanticPolicySchema, type SemanticPolicy } from "@/shared/semantic-policy/index";
import type { VariantContent } from "@/shared/semantic-board/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { corridorPoints, type DrawnPoint } from "@/runtime/semantic-renderer/tests/drawn-routes";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import agentWorkbench from "./agent-workbench.json";
import recordingAWalkthrough from "./recording-a-walkthrough-graphviz.json";

/** The vocabulary of the fixture, in the dogfood vault's order. */
const policy = SemanticPolicySchema.parse({
	levels: ["service"],
	nodeKinds: {
		module: { name: "Module", icon: "RiBox3Line" },
		service: { name: "Service", icon: "RiServerLine" },
		external: { name: "External", icon: "RiExternalLinkLine" },
	},
	relationshipKinds: {
		call: { name: "Call", dash: "solid", arrowhead: "filled" },
		rpc: { name: "RPC", color: "violet", dash: "solid", arrowhead: "filled" },
		event: { name: "Event", color: "fuchsia", dash: "dashed", arrowhead: "open" },
		data: { name: "Data", color: "teal", dash: "solid", arrowhead: "filled" },
	},
	groups: {
		voice: { name: "Voice", color: "yellow" },
		workhorse: { name: "Workhorse", color: "sky" },
		child: { name: "Codex child", color: "indigo" },
	},
});

/** A straight run of a drawn line. */
interface Run {
	readonly vertical: boolean;
	readonly at: number;
	readonly from: number;
	readonly to: number;
}

/**
 * The straight runs of a drawn line.
 * @param points Its drawn points.
 * @returns Its horizontal and vertical runs.
 */
function runsOf(points: readonly DrawnPoint[]): Run[] {
	return points.slice(1).flatMap((point, index) => {
		const previous = points[index]!;
		const vertical = Math.abs(point.x - previous.x) < 0.01;
		if (!vertical && Math.abs(point.y - previous.y) >= 0.01) return [];
		const [one, other] = vertical ? [previous.y, point.y] : [previous.x, point.x];
		const at = vertical ? point.x : point.y;
		return [{ vertical, at, from: Math.min(one, other), to: Math.max(one, other) }];
	});
}

/**
 * The pairs of unrelated lines a drawing draws on one stroke.
 * @param content The board.
 * @param options The vocabulary, where the board needs its own.
 * @param options.policy The policy.
 * @returns One key for every such pair.
 */
async function stackedPairs(
	content: VariantContent,
	options: { readonly policy?: SemanticPolicy } = {},
): Promise<string[]> {
	const drawn = await renderArchitecture({
		content,
		theme: "light",
		layout: "graphviz",
		...options,
	});
	const routes = corridorPoints(drawn.svg);
	const edges = content.edges;
	return edges.flatMap((one, index) =>
		edges.slice(index + 1).flatMap((other) => {
			const ends = new Set([one.from, one.to]);
			if (ends.has(other.from) || ends.has(other.to)) return [];
			const [mine, theirs] = [runsOf(routes.get(one.id)!), runsOf(routes.get(other.id)!)];
			const shared = mine.some((run) =>
				theirs.some(
					(against) =>
						run.vertical === against.vertical &&
						Math.abs(run.at - against.at) <= 2 &&
						Math.min(run.to, against.to) - Math.max(run.from, against.from) >= 16,
				),
			);
			return shared ? [`${one.id}|${other.id}`] : [];
		}),
	);
}

test("unrelated lines never share one stroke in the gap between two cards", async () => {
	expect(await stackedPairs(orderedFixture(agentWorkbench), { policy })).toEqual([]);
});

test("two lines on one stroke part where that saves a crossing, though a line takes a bend more", async () => {
	expect(await stackedPairs(orderedFixture(recordingAWalkthrough))).toEqual([]);
});
