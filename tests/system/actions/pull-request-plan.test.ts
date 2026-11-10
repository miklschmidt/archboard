// The plan and fail policy of the pull-request Action.

import { describe, expect, test } from "bun:test";
import { decideOutOfPlan } from "../../../actions/pull-request/plan.ts";
import { planBuckets, proposalPlan } from "../../../actions/pull-request/proposal-plan.ts";

/**
 * One changed part, as a footprint lists it.
 * @param name The module's name.
 * @param id The module's stable identity.
 * @returns The list of that one part.
 */
function part(name: string, id = `m#${name.toLowerCase()}`) {
	return [{ subject: { id, name } }];
}

describe("the plan of a proposal", () => {
	const intake = { id: "m#intake", name: "Intake", binding: { path: "intake" }, outgoing: [] };
	const billing = { id: "m#billing", name: "Billing", binding: { path: "billing" } };
	const docs = { id: "m#docs", name: "Docs" };
	const base = { modules: [intake, billing, docs], relationships: [] };
	const head = {
		modules: [{ ...intake, outgoing: [{ id: "m#quote" }], file: "x.module.json" }, billing, docs],
		relationships: [{ id: "m#quote", from: "m#intake", to: "m#billing", kind: "http" }],
	};

	test("names both ends of a new relationship, and only modules bound to code", () => {
		const plan = proposalPlan(base, head);
		expect(plan.comparison).toEqual(["relationships: 1 added"]);
		expect([...plan.named.values()].toSorted()).toEqual(["Billing", "Intake"]);
	});

	test("names the ends of a changed relationship before and after", () => {
		const catalog = { id: "m#catalog", name: "Catalog", binding: { path: "catalog" } };
		const line = { id: "m#quote", from: "m#intake", to: "m#billing", kind: "http" };
		const moved = proposalPlan(
			{ modules: [intake, billing, catalog], relationships: [line] },
			{ modules: [intake, billing, catalog], relationships: [{ ...line, to: "m#catalog" }] },
		);
		expect(moved.comparison).toEqual(["relationships: 1 changed"]);
		expect([...moved.named.values()].toSorted()).toEqual(["Billing", "Catalog", "Intake"]);
	});

	test("sets the changed modules of the footprint against that plan, for a draft or an adopted proposal", () => {
		const plan = proposalPlan(base, head);
		const expected = {
			plannedAndChanged: ["Intake"],
			outsidePlan: ["Catalog"],
			plannedUnchanged: ["Billing"],
			changed: ["Catalog", "Intake"],
			unbound: [],
		};
		expect(
			planBuckets({ namedAndChanged: part("Intake"), changedNotNamed: part("Catalog") }, plan),
		).toEqual(expected);
		const footprint = {
			changed: [...part("Intake"), ...part("Catalog")],
			unboundFiles: [{ repo: "github.com/acme/shop", path: "docs/notes.md" }],
		};
		expect(planBuckets(footprint, plan)).toEqual({
			plannedAndChanged: ["Intake"],
			outsidePlan: ["Catalog"],
			plannedUnchanged: ["Billing"],
			changed: ["Catalog", "Intake"],
			unbound: [{ repo: "github.com/acme/shop", path: "docs/notes.md" }],
		});
	});

	test("a changed module that holds another is never outside the plan, unless the CLI is older", () => {
		const plan = {
			comparison: [],
			named: new Map([["m#installation", "Installation"]]),
			baseOnlyBindings: new Set<string>(),
		};
		const workspace = {
			subject: { id: "m#workspace", name: "Workspace" },
			holds: ["m#installation"],
		};
		const installation = { subject: { id: "m#installation", name: "Installation" }, holds: [] };
		expect(planBuckets({ changed: [workspace, installation] }, plan)).toMatchObject({
			plannedAndChanged: ["Installation"],
			outsidePlan: [],
			changed: ["Installation", "Workspace"],
		});
		const older = { changed: [{ subject: workspace.subject }, { subject: installation.subject }] };
		expect(planBuckets(older, plan).outsidePlan).toEqual(["Workspace"]);
	});

	test("joins by identity when names are ambiguous, and sorts each bucket", () => {
		const named = new Map([
			["planned", "API"],
			["billing", "Billing"],
			["catalog", "Catalog"],
			["removed", "Gone"],
		]);
		const buckets = planBuckets(
			{
				changed: [...part("Zulu", "z"), ...part("API", "unplanned"), ...part("Billing", "billing")],
				skipped: part("Gone", "removed"),
			},
			{ comparison: [], named, baseOnlyBindings: new Set() },
		);
		expect(buckets).toEqual({
			plannedAndChanged: ["Billing"],
			outsidePlan: ["API", "Zulu"],
			plannedUnchanged: ["API", "Catalog"],
			changed: ["API", "Billing", "Zulu"],
			unbound: [],
		});
		expect(
			decideOutOfPlan({
				mode: "fail",
				hasProposal: true,
				judgeable: true,
				outside: buckets.outsidePlan,
				labels: [],
				overrideLabel: "override",
			}).failed,
		).toBe(true);
	});
});

describe("changes outside the plan", () => {
	const base = {
		hasProposal: true,
		judgeable: true,
		outside: ["Stock API"],
		labels: [] as string[],
		overrideLabel: "archboard: out of plan",
	};

	test("fail mode fails unless the pull request carries the override label", () => {
		expect(decideOutOfPlan({ ...base, mode: "fail" })).toEqual({ status: "fail", failed: true });
		expect(decideOutOfPlan({ ...base, mode: "fail", labels: [base.overrideLabel] })).toEqual({
			status: "overridden",
			failed: false,
		});
	});

	test("fail mode fails when the plan cannot be checked, unless the label lets it through", () => {
		const unread = { ...base, judgeable: false, outside: [] };
		expect(decideOutOfPlan({ ...unread, mode: "fail" })).toEqual({
			status: "unjudged",
			failed: true,
		});
		expect(decideOutOfPlan({ ...unread, mode: "fail", labels: [base.overrideLabel] })).toEqual({
			status: "unjudged-overridden",
			failed: false,
		});
		expect(decideOutOfPlan({ ...unread, mode: "warn" }).failed).toBe(false);
	});

	test("warn mode never fails, and with no proposal nothing is out of plan", () => {
		expect(decideOutOfPlan({ ...base, mode: "warn" }).failed).toBe(false);
		expect(decideOutOfPlan({ ...base, mode: "fail", hasProposal: false }).failed).toBe(false);
		expect(decideOutOfPlan({ ...base, mode: "off" }).status).toBe("off");
	});
});
