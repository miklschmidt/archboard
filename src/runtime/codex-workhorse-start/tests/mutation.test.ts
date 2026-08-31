import { describe, expect, test } from "bun:test";

import type { ThreadLinkBindingSnapshot } from "../../codex-thread-link/index.js";
import type { WorkhorseSnapshot } from "../index.js";
import {
	CHECKOUT_ROOT,
	executableBinding,
	inspectOnlyBinding,
	makeFixture,
	startResponse,
} from "./support.js";

function expectDeepFrozen(value: unknown, seen = new Set<object>()): void {
	if (value === null || typeof value !== "object" || seen.has(value)) return;
	seen.add(value);
	expect(Object.isFrozen(value)).toBe(true);
	for (const key of Reflect.ownKeys(value)) expectDeepFrozen(Reflect.get(value, key), seen);
}

function expectSnapshotMutationIsRefused(snapshot: WorkhorseSnapshot): void {
	expectDeepFrozen(snapshot);
	const start = snapshot.start;
	if (start !== null) {
		const approvalPolicy = start.approvalPolicy;
		if (
			approvalPolicy !== null &&
			typeof approvalPolicy === "object" &&
			"granular" in approvalPolicy
		) {
			expect(() => Object.assign(approvalPolicy.granular, { rules: false })).toThrow();
		}
		const sandbox = start.sandbox;
		if (sandbox.type === "workspaceWrite") {
			expect(() => sandbox.writableRoots.push("/mutated")).toThrow();
		}
		const activePermissionProfile = start.activePermissionProfile;
		if (activePermissionProfile !== null) {
			expect(() => Object.assign(activePermissionProfile, { id: "mutated" })).toThrow();
		}
	}
	const binding = snapshot.binding;
	if (binding !== null) {
		expect(() => Object.assign(binding.link, { loaded: false })).toThrow();
		expect(() => Object.assign(binding.cas, { revision: 999 })).toThrow();
	}
	const cleanup = snapshot.cleanup;
	if (cleanup !== null) {
		expect(() => Object.assign(cleanup, { outcome: "outcome_unknown" })).toThrow();
	}
}

function mutateOriginalNestedValues(
	approvalPolicy: { granular: { sandbox_approval: boolean; rules: boolean } },
	sandbox: { writableRoots: string[] },
	activePermissionProfile: { id: string },
	binding: ThreadLinkBindingSnapshot,
): void {
	approvalPolicy.granular.sandbox_approval = false;
	approvalPolicy.granular.rules = false;
	sandbox.writableRoots.push("/mutated");
	activePermissionProfile.id = "mutated-profile";
	Object.assign(binding, { revision: 999 });
	Object.assign(binding.link, { loaded: false, canAcceptDirectInput: false });
	Object.assign(binding.cas, { revision: 999 });
}

describe("codex workhorse retained-value immutability", () => {
	test("clones nested response facts and executable binding values", async () => {
		const fixture = makeFixture();
		try {
			const approvalPolicy = {
				granular: {
					sandbox_approval: true,
					rules: true,
					skill_approval: true,
					request_permissions: true,
					mcp_elicitations: true,
				},
			};
			const sandbox = {
				type: "workspaceWrite" as const,
				writableRoots: [CHECKOUT_ROOT],
				networkAccess: true,
				excludeTmpdirEnvVar: false,
				excludeSlashTmp: false,
			};
			const activePermissionProfile = { id: "archboard-default", extends: null };
			const response = startResponse(fixture.thread, {
				approvalPolicy,
				sandbox,
				activePermissionProfile,
			});
			const binding = executableBinding(
				"pane-1",
				2,
				fixture.authorities.identity.validator.childId,
				fixture.authorities.identity.validator.epoch,
				fixture.thread.id,
			);
			fixture.session.startResult = response;
			fixture.link.outcome = binding;

			const result = await fixture.starter.start({ paneId: "pane-1", expected: null });
			const settled = structuredClone(result);

			expect(result.state).toBe("ready");
			expectSnapshotMutationIsRefused(result);
			const target = fixture.link.targets[0]?.target;
			if (target?.provenance == null) {
				throw new Error(
					"The start transaction did not pass durable provenance to the binding port.",
				);
			}
			expectDeepFrozen(target);
			const provenance = target.provenance;
			expect(() => Object.assign(provenance, { record: null })).toThrow();

			mutateOriginalNestedValues(approvalPolicy, sandbox, activePermissionProfile, binding);

			expect(result).toEqual(settled);
			expect(fixture.starter.snapshot()).toEqual(settled);
			expect(result.start).toMatchObject({
				approvalPolicy: { granular: { sandbox_approval: true, rules: true } },
				sandbox: { type: "workspaceWrite", writableRoots: [CHECKOUT_ROOT] },
				activePermissionProfile: { id: "archboard-default" },
			});
			expect(result.binding).toMatchObject({
				revision: 2,
				link: { loaded: true, canAcceptDirectInput: true },
				cas: { revision: 2 },
			});
		} finally {
			fixture.dispose();
		}
	});

	test("keeps inspect-only cleanup snapshots isolated from all source values", async () => {
		const fixture = makeFixture();
		try {
			const approvalPolicy = {
				granular: {
					sandbox_approval: true,
					rules: true,
					skill_approval: true,
					request_permissions: true,
					mcp_elicitations: true,
				},
			};
			const sandbox = {
				type: "workspaceWrite" as const,
				writableRoots: [CHECKOUT_ROOT],
				networkAccess: true,
				excludeTmpdirEnvVar: false,
				excludeSlashTmp: false,
			};
			const activePermissionProfile = { id: "archboard-default", extends: null };
			const response = startResponse(fixture.thread, {
				approvalPolicy,
				sandbox,
				activePermissionProfile,
			});
			const binding = inspectOnlyBinding("pane-1", 2, fixture.thread.id);
			fixture.session.startResult = response;
			fixture.link.outcome = binding;

			const result = await fixture.starter.start({ paneId: "pane-1", expected: null });
			const settled = structuredClone(result);

			expect(result.state).toBe("inspect_only");
			expect(result.cleanup?.outcome).toBe("delivered");
			expectSnapshotMutationIsRefused(result);
			mutateOriginalNestedValues(approvalPolicy, sandbox, activePermissionProfile, binding);

			expect(result).toEqual(settled);
			expect(fixture.starter.snapshot()).toEqual(settled);
			expect(result.cleanup).toMatchObject({
				threadId: fixture.thread.id,
				outcome: "delivered",
			});
		} finally {
			fixture.dispose();
		}
	});
});
