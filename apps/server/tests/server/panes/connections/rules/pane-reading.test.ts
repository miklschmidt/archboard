import { describe, expect, test } from "bun:test";
import { defaultSemanticPolicy } from "@archboard/model/policy";
import type { readArchitectureModel } from "@archboard/model/store-read";
import type { semanticPaneContextSchema } from "@archboard/model/pane-context";
import type { z } from "zod";
import {
	extractDisplaySettings,
	isSettingsOnlyRequest,
	mergeKeptReading,
	resolvePaneReading,
} from "#server/panes/connections/rules/pane-reading.ts";

type Model = Extract<Awaited<ReturnType<typeof readArchitectureModel>>, { success: true }>;
type CapturedArchitecture = NonNullable<
	z.infer<ReturnType<typeof semanticPaneContextSchema>>["architecture"]
>;

/**
 * Build a small canonical model with custom kinds, groups, containers, and mixed-effect edges.
 * @returns The fixture model.
 */
function sampleModel(): Model {
	const basePolicy = defaultSemanticPolicy();
	const policy = {
		...basePolicy,
		relationshipKinds: {
			...basePolicy.relationshipKinds,
			http: { name: "HTTP", color: "sky" as const },
		},
		groups: {
			core: { name: "Core Path", color: "blue" as const },
		},
	};
	return {
		success: true,
		manifest: { schemaVersion: 1, id: "Shop", name: "Web Shop", summary: "Fixture" },
		policy,
		revision: { digest: "a".repeat(64), files: [] },
		modules: [
			{
				schemaVersion: 1,
				id: "Shop#gw",
				order: 0,
				name: "Gateway",
				kind: "service",
				groups: ["core"],
				outgoing: [],
			},
			{
				schemaVersion: 1,
				id: "Shop#bill",
				order: 1,
				name: "Billing",
				formerNames: ["Payments"],
				kind: "service",
				groups: ["core"],
				outgoing: [],
			},
			{
				schemaVersion: 1,
				id: "Shop#led",
				order: 2,
				name: "Ledger",
				kind: "module",
				parent: "Shop#bill",
				outgoing: [],
			},
			{
				schemaVersion: 1,
				id: "Shop#auth",
				order: 3,
				name: "Auth Server",
				kind: "service",
				outgoing: [],
			},
		],
		relationships: [
			{
				id: "Shop#r1",
				from: "Shop#gw",
				to: "Shop#bill",
				kind: "http",
				effect: "query",
				label: "GET /invoices",
				emphasis: "normal",
			},
			{
				id: "Shop#r2",
				from: "Shop#gw",
				to: "Shop#led",
				kind: "async",
				effect: "mutation",
				label: "charge.requested",
				emphasis: "normal",
			},
			{
				id: "Shop#r3",
				from: "Shop#gw",
				to: "Shop#led",
				kind: "async",
				effect: "query",
				label: "balance.lookup",
				emphasis: "normal",
			},
			{
				id: "Shop#r4",
				from: "Shop#bill",
				to: "Shop#led",
				kind: "sync",
				effect: "mutation",
				label: "append entry",
				emphasis: "normal",
			},
		],
		collections: [],
		walkthroughs: [],
		proposals: [],
	} as unknown as Model;
}

describe("pane-reading resolution", () => {
	const model = sampleModel();

	test("detects settings-only requests without confusing navigation requests", () => {
		expect(isSettingsOnlyRequest({ layout: "lanes" })).toBe(true);
		expect(isSettingsOnlyRequest({ theme: "dark", hoverLight: "off" })).toBe(true);
		expect(extractDisplaySettings({ layout: "lanes", theme: "system" })).toEqual({
			layout: "lanes",
			theme: "system",
		});
		expect(isSettingsOnlyRequest({ layout: "lanes", scope: "Gateway" })).toBe(false);
		expect(isSettingsOnlyRequest({ onlyKinds: ["http"] })).toBe(false);
	});

	test("resolves --only-kind to all lens plus complement hideKinds", () => {
		const resolved = resolvePaneReading(model, { onlyKinds: ["HTTP"] });
		expect(resolved.ok).toBe(true);
		if (!resolved.ok) return;
		expect(resolved.reading.lens).toBe("all");
		expect(resolved.reading.hideKinds).not.toContain("http");
		expect(resolved.reading.hideKinds).toContain("sync");
		expect(resolved.reading.hideKinds).toContain("async");
	});

	test("refuses unknown kinds with KIND_NOT_FOUND", () => {
		const resolved = resolvePaneReading(model, { onlyKinds: ["grpc"] });
		expect(resolved.ok).toBe(false);
		if (resolved.ok) return;
		expect(resolved.error.code).toBe("KIND_NOT_FOUND");
		expect(resolved.error.error).toContain("http");
	});

	test("resolves mutating async calls to a container including its descendants", () => {
		const resolved = resolvePaneReading(model, {
			onlyKinds: ["async"],
			onlyEffects: ["mutation"],
			to: ["Billing"],
		});
		expect(resolved.ok).toBe(true);
		if (!resolved.ok) return;
		expect(resolved.reading.lens).toBe("all");
		expect(resolved.reading.focus).toEqual(["Shop#r2"]);
		expect(resolved.reading.hideEffects).toEqual(["query", "compute", "declared"]);
	});

	test("refuses directional filters when no relationships match", () => {
		const resolved = resolvePaneReading(model, {
			onlyKinds: ["http"],
			onlyEffects: ["mutation"],
			to: ["Billing"],
		});
		expect(resolved.ok).toBe(false);
		if (resolved.ok) return;
		expect(resolved.error.code).toBe("NO_MATCHING_RELATIONSHIPS");
		expect(resolved.error.error).toContain("Found 3 directional relationship(s)");
	});

	test("resolves module names, former names, and group memberships", () => {
		const resolved = resolvePaneReading(model, {
			scope: "Payments",
			expand: ["gateway"],
			group: "Core Path",
			select: ["Auth Server"],
		});
		expect(resolved.ok).toBe(true);
		if (!resolved.ok) return;
		expect(resolved.reading.scope).toBe("Shop#bill");
		expect(resolved.reading.expand).toEqual(["Shop#gw"]);
		expect(resolved.reading.select).toEqual(["Shop#auth", "Shop#gw", "Shop#bill"]);
	});

	test("merges --keep onto the pane's currently reported architecture", () => {
		const current: CapturedArchitecture = {
			vault: "/repo/.archboard/vault",
			model: "Shop",
			expectedRevision: "a".repeat(64),
			subjects: [],
			selection: { state: "draft-1", compare: false },
			display: {
				model: "Web Shop",
				comparison: "No comparison",
				ref: "feature/auth",
				file: "src/auth.ts",
				page: "about",
				hideKinds: ["dependency"],
			},
			reading: {
				scope: "Shop#bill",
				focus: ["Shop#r1"],
				expand: ["Shop#gw"],
				lens: "all",
				relationshipKinds: ["http", "sync", "async"],
				grammar: "architecture",
			},
		};
		const merged = mergeKeptReading({ keep: true, onlyKinds: ["http"] }, current);
		expect(merged.scope).toBe("Shop#bill");
		expect(merged.expand).toEqual(["Shop#gw"]);
		expect(merged.state).toBe("draft-1");
		expect(merged.compare).toBe(false);
		expect(merged.ref).toBe("feature/auth");
		expect(merged.file).toBe("src/auth.ts");
		expect(merged.page).toBe("about");
		expect(merged.onlyKinds).toEqual(["http"]);
		expect(merged.hideKinds).toBeUndefined();
	});

	test("resolves an ephemeral flowchart with canonical and synthetic participants", () => {
		const resolved = resolvePaneReading(model, {
			ephemeralFlow: {
				name: "Returning user auth",
				summary: "How returning sessions negotiate authentication.",
				participants: ["Returning User", "Gateway", "Auth Server"],
				steps: [
					{ kind: "sync", from: "Returning User", to: "Gateway", label: "Open app" },
					{
						kind: "decision",
						question: "Cookie valid?",
						alternatives: [
							{
								label: "Yes",
								steps: [
									{ kind: "sync", from: "Gateway", to: "Auth Server", label: "Verify token" },
								],
							},
							{
								label: "No",
								steps: [
									{ kind: "return", from: "Gateway", to: "Returning User", label: "401 login" },
								],
							},
						],
					},
				],
			},
		});
		expect(resolved.ok).toBe(true);
		if (!resolved.ok) return;
		expect(resolved.reading.grammar).toBe("flowchart");
		const eph = resolved.reading.resolvedEphemeralFlow;
		expect(eph).toBeDefined();
		expect(eph?.flow.participants).toEqual(["eph#p1", "Shop#gw", "Shop#auth"]);
		expect(eph?.syntheticParticipants).toEqual([{ id: "eph#p1", name: "Returning User" }]);
		expect(eph?.flow.steps).toHaveLength(2);
	});

	test("refuses ephemeral flow with architecture grammar or undeclared step participant", () => {
		const wrongGrammar = resolvePaneReading(model, {
			grammar: "architecture",
			ephemeralFlow: {
				name: "Auth",
				participants: ["Gateway", "Auth Server"],
				steps: [{ kind: "sync", from: "Gateway", to: "Auth Server", label: "Check" }],
			},
		});
		expect(wrongGrammar.ok).toBe(false);
		if (!wrongGrammar.ok) expect(wrongGrammar.error.code).toBe("FLOW_GRAMMAR_REQUIRED");

		const badParticipant = resolvePaneReading(model, {
			grammar: "sequence",
			ephemeralFlow: {
				name: "Auth",
				participants: ["Gateway"],
				steps: [{ kind: "sync", from: "Gateway", to: "Ghost", label: "Check" }],
			},
		});
		expect(badParticipant.ok).toBe(false);
		if (!badParticipant.ok) expect(badParticipant.error.code).toBe("INVALID_EPHEMERAL_FLOW");
	});
});
