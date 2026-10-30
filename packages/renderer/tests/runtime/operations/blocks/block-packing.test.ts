import { expect, test } from "bun:test";
import { SemanticPolicySchema } from "@archboard/board/policy";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { routePoints, turnsOf } from "#tests/runtime/support/drawn-routes.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import boardRasterizer from "#tests/runtime/support/fixtures/board-rasterizer.json";
import legacyRouting from "#tests/runtime/support/fixtures/legacy-routing.json";
import voiceCoordinator from "#tests/runtime/support/fixtures/voice-coordinator.json";
import workingWithAnAgent from "#tests/runtime/support/fixtures/working-with-an-agent.json";

/** The vocabulary of the fixtures, in the dogfood vault's order. */
const policy = SemanticPolicySchema.parse({
	levels: ["service"],
	nodeKinds: {
		module: { name: "Module", icon: "RiBox3Line" },
		function: { name: "Function", icon: "RiCodeSSlashLine" },
		external: { name: "External", icon: "RiExternalLinkLine" },
		ui: { name: "User interface", icon: "RiLayoutLine" },
		system: { name: "System", icon: "RiApps2Line" },
		service: { name: "Service", icon: "RiServerLine" },
	},
	relationshipKinds: {
		call: { name: "Call", dash: "solid", arrowhead: "filled" },
		rpc: { name: "RPC", color: "violet", dash: "solid", arrowhead: "filled" },
		http: { name: "HTTP", color: "sky", dash: "solid", arrowhead: "filled" },
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

test("a block moved up into a column stands below the blocks that lead to it", async () => {
	const content = orderedFixture(boardRasterizer);
	const { atlas } = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	const [command, chromium] = [atlas.nodes["jChkQdeE"]!, atlas.nodes["R9St060W"]!];
	expect(chromium.y).toBeGreaterThan(command.y + command.height);
});

test("blocks read forward across a row or down the page", async () => {
	const content = orderedFixture(voiceCoordinator);
	const { atlas } = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	const [source, target] = [atlas.nodes["LHBPlItu"]!, atlas.nodes["5uPyMgoI"]!];
	expect(target.y >= source.y + source.height || target.x >= source.x + source.width).toBe(true);
});

test("a block moves up beside an earlier one only to fill real room", async () => {
	const content = orderedFixture(workingWithAnAgent);
	const { atlas } = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	const [pane, voice] = [atlas.nodes["xsn0RvSi"]!, atlas.nodes["0SRnYXnC"]!];
	expect(voice.y).toBeGreaterThan(pane.y + pane.height);
});

// Reduced from a board of a work vault, letters replaced: a chain of cards
// above a wide pool its last line enters. Neither centring the chain nor
// sliding it in line with the line may leave a step in that line.
test("a chain over a wide container reads straight down into it", async () => {
	const content = orderedFixture(legacyRouting);
	const { svg } = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	expect(turnsOf(routePoints(svg).get("amhQ7pOU")!)).toBe(0);
});
