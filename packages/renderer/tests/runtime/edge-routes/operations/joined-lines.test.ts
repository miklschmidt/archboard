// What this catches: lines of one kind into one card that part again where they
// had joined, or that join and still end at two points.

import { expect, test } from "bun:test";
import { renderArchitecture } from "#runtime/bun-renderer/operations/render.ts";
import { semanticPolicySchema } from "@archboard/model/policy";
import { corridorPoints, sharedStretches } from "#tests/runtime/support/drawn-routes.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import twinLines from "#tests/runtime/support/fixtures/twin-lines.json";

/** The sideways room a line's two fixed 8 px bends need to step aside and on. */
const TWO_BENDS = 16;

/** The vocabulary the fixtures reduced from dogfood documents draw with, its groups in the vault's order. */
const policy = semanticPolicySchema().parse({
	levels: ["service"],
	nodeKinds: {
		module: { name: "Module", icon: "RiBox3Line" },
		function: { name: "Function", icon: "RiCodeSSlashLine" },
		external: { name: "External", icon: "RiExternalLinkLine" },
		service: { name: "Service", icon: "RiServerLine" },
		system: { name: "System", icon: "RiApps2Line" },
		ui: { name: "User interface", icon: "RiLayoutLine" },
	},
	relationshipKinds: {
		call: { name: "Call", dash: "solid", arrowhead: "filled" },
		rpc: { name: "RPC", color: "violet", dash: "solid", arrowhead: "filled" },
		event: { name: "Event", color: "fuchsia", dash: "dashed", arrowhead: "open" },
		dependency: { name: "Dependency", dash: "dotted", arrowhead: "open" },
		data: { name: "Data", color: "teal", dash: "solid", arrowhead: "filled" },
		render: { name: "Render", color: "pink", dash: "solid", arrowhead: "filled" },
	},
	groups: {
		writes: { name: "Board writes", color: "orange" },
		drawing: { name: "Drawing", color: "violet" },
		panes: { name: "Live panes", color: "teal" },
		walkthrough: { name: "Walkthroughs", color: "cyan" },
		voice: { name: "Voice", color: "yellow" },
		workhorse: { name: "Workhorse", color: "sky" },
		child: { name: "Codex child", color: "indigo" },
		agent: { name: "Agent", color: "fuchsia" },
		checks: { name: "Vault checks", color: "pink" },
	},
});

test("lines of one kind that join on the way to a card stay one line into it", async () => {
	const content = orderedFixture(twinLines);
	const drawing = await renderArchitecture({ content, theme: "light", policy });
	const routes = corridorPoints(drawing.svg);
	const parted = content.edges.flatMap((one, index) =>
		content.edges
			.slice(index + 1)
			.filter(({ to, kind }) => to === one.to && kind === one.kind)
			.flatMap((other) => {
				const [a, b] = [routes.get(one.id)!, routes.get(other.id)!];
				const shared = sharedStretches(a, b);
				const [end, otherEnd] = [a.at(-1)!, b.at(-1)!];
				const together = Math.hypot(end.x - otherEnd.x, end.y - otherEnd.y) < 1;
				const joined = shared.reduce((sum, length) => sum + length, 0) > TWO_BENDS;
				return joined && (!together || shared.length > 1) ? [`${one.id}/${other.id}`] : [];
			}),
	);
	expect(parted).toEqual([]);
});
