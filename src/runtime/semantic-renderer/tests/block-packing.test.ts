// A block of blocks packs its blocks in rows or columns in the order their
// lines run, and tries each packing with a late small block moved up into an
// earlier row or column that has room for it. Moving one to the head of a
// column stood it over the blocks that lead to it, and moving one only within
// a row read that row against its lines, neither filling any room.
import { expect, test } from "bun:test";
import { SemanticPolicySchema } from "@/shared/semantic-policy/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import boardRasterizer from "./board-rasterizer.json";
import voiceCoordinator from "./voice-coordinator.json";

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
