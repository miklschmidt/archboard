// A block of blocks packs its blocks in rows or columns in the order their
// lines run, and tries each packing with a late small block moved up into an
// earlier row or column that has room for it. Moving one to the head of a
// column stood it over the blocks that lead to it, and moving one only within
// a row read that row against its lines, neither filling any room, and a
// move that packs the blocks hardly smaller only reshaped the page. A block
// with bottom ports holds the cards its chains start from on its first rank.
import { expect, test } from "bun:test";
import { SemanticPolicySchema } from "@/shared/semantic-policy/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import boardRasterizer from "./board-rasterizer.json";
import voiceCoordinator from "./voice-coordinator.json";
import workingWithAnAgent from "./working-with-an-agent.json";

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

test("a row of blocks reads in the order their lines run", async () => {
	const content = orderedFixture(voiceCoordinator);
	const { atlas } = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	expect(atlas.nodes["LHBPlItu"]!.x).toBeLessThan(atlas.nodes["5uPyMgoI"]!.x);
});

test("a block moves up beside an earlier one only to fill real room", async () => {
	const content = orderedFixture(workingWithAnAgent);
	const { atlas } = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	const [pane, voice] = [atlas.nodes["xsn0RvSi"]!, atlas.nodes["0SRnYXnC"]!];
	expect(voice.y).toBeGreaterThan(pane.y + pane.height);
});

// Reduced from a board of a work vault, names replaced: a database only the
// pool's machines call, below the chain that leads into the pool, was held
// on the chain's first rank, and each of its lines climbed the whole block.
test("a card only lines from below reach stands down by them, not on the first rank", async () => {
	const content = orderedFixture({
		nodes: [
			{ id: "traffic", name: "Partner traffic", kind: "external" },
			{ id: "proxy", name: "Edge proxy", kind: "external" },
			{ id: "balancer", name: "Load balancer", kind: "service" },
			{ id: "db", name: "Shared database", kind: "service" },
			{ id: "pool", name: "VM pool", kind: "system" },
			{ id: "vm", name: "IIS VM", kind: "service", parent: "pool" },
		],
		edges: [
			{ id: "e1", from: "traffic", to: "proxy", kind: "http" },
			{ id: "e2", from: "proxy", to: "balancer", kind: "http" },
			{ id: "e3", from: "balancer", to: "pool", kind: "http" },
			{ id: "e4", from: "vm", to: "db", kind: "data" },
		],
	});
	const { atlas } = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	const { traffic, db } = atlas.nodes;
	expect(db!.y).toBeGreaterThan(traffic!.y + traffic!.height);
});
