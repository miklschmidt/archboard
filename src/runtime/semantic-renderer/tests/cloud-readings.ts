import { VariantContentSchema } from "@/shared/semantic-board/index";
import cloud from "@/runtime/semantic-renderer/tests/branching-cloud.json";

// The predecessor and successor of the existing device migration fixture.
// Keep the measured words and topology responsible for their different folds.
const deviceOnly = new Set(["t2QlUi5k", "1yU3ivZL", "9BTlRpYl"]);
export const observedCloud = VariantContentSchema.parse({
	nodes: cloud.nodes
		.filter((node) => !deviceOnly.has(node.id))
		.map((node) =>
			Object.assign(
				{},
				node,
				node.id === "ywwZuKxy"
					? { responsibility: "Regional paths converge at this public entry." }
					: node.id === "lqxzyMcC"
						? { responsibility: "Forwards L4 traffic to the Windows / IIS pool." }
						: {},
			),
		),
	edges: cloud.edges
		.filter(
			(edge) => !["1ABsFJsd", "d7kqpa89", "g1zvz5QO", "4D1O2GEw", "TR9Ic6TU"].includes(edge.id),
		)
		.concat({
			id: "TR9Ic6TU",
			from: "ywwZuKxy",
			to: "lqxzyMcC",
			kind: "other",
			label: "Public transport",
			description: "Regional entry reaches the existing load balancer.",
			emphasis: "hero",
		}),
});

export const platformCloud = VariantContentSchema.parse({
	nodes: [
		...cloud.nodes.map((node) =>
			Object.assign(
				{},
				node,
				node.id === "t2QlUi5k"
					? {
							responsibility:
								"Retains device trust and routes selected APIs to Platform services; unmatched requests stay on IIS.",
						}
					: {},
			),
		),
		{
			id: "Pt2vjo40",
			name: "Migrated API capabilities",
			kind: "service",
			responsibility:
				"Proposed Platform-owned replacements, activated one verified API route at a time.",
		},
	],
	edges: [
		...cloud.edges.map((edge) =>
			Object.assign(
				{},
				edge,
				edge.id === "g1zvz5QO" ? { label: "Unmatched routes balance across healthy VMs" } : {},
			),
		),
		{
			id: "cKy6Pt3i",
			from: "t2QlUi5k",
			to: "Pt2vjo40",
			kind: "http",
			label: "Selected API hosts / paths",
			emphasis: "hero",
		},
		...["hlSwOqFY", "NQs6vUYx"].map((to, index) => ({
			id: ["7C6xGZco", "hnLcA0yR"][index],
			from: "Pt2vjo40",
			to,
			kind: "data",
			label: "Database connection",
		})),
	],
});
