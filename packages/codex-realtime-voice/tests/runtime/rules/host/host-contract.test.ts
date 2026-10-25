import type { WorkbenchThreadProfile } from "#runtime/protocol/host/instructions.ts";
import { CORE_ROLE_INSTRUCTIONS } from "#runtime/rules/host/authored.ts";
import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
	createWorkbenchThreadProfile,
	captureThreadProfile,
} from "#runtime/rules/host/instructions.ts";
import { createWorkbenchTurnStartParams } from "#runtime/rules/host/bodies.ts";
import { createWorkhorseThreadStartParams } from "#runtime/rules/workhorse-start/model.ts";
import { type WorkbenchExecutionContext } from "#runtime/protocol/host/context.ts";

function context(): WorkbenchExecutionContext {
	return {
		paneId: "session",
		child: { id: "child", epoch: "epoch" },
		threadLink: { state: "executable", reason: null },
		workhorse: { threadId: "worker", turnId: null },
		coordinator: { threadId: "coordinator", realtimeSessionId: null },
		semantic: { brief: "Host context", capturedAtMs: 1, freshUntilMs: 2, truncated: false },
		operation: { id: "operation", kind: "delegate_to_workhorse", rpc: "turn/start", outcome: null },
	};
}

test("a host starts a Codex workhorse with its own identity and exact composed instruction bytes", () => {
	const domain = "Host instructions with trailing spaces.  \n";
	const profile = createWorkbenchThreadProfile({
		role: "workhorse",
		serviceName: "standalone",
		threadSource: "standalone",
		domainInstructions: domain,
		dynamicTools: [],
	});
	const params = createWorkhorseThreadStartParams("/allowed/checkout", profile);
	expect(params.serviceName).toBe("standalone");
	expect(params.threadSource).toBe("standalone");
	expect(params.developerInstructions).toBe(`${CORE_ROLE_INSTRUCTIONS.workhorse}\n${domain}`);
	expect(
		createHash("sha256")
			.update(params.developerInstructions ?? "")
			.digest("hex"),
	).toBe(profile.instructions.sha256);
	expect(params.dynamicTools?.map((tool) => tool.name)).toEqual(["archboard_coordinator"]);
	expect(Object.isFrozen(profile.dynamicTools)).toBe(true);
	expect(() =>
		captureThreadProfile({
			...profile,
			instructions: { ...profile.instructions, text: "changed" },
		}),
	).toThrow(TypeError);
});

test("a host cannot replace a built-in coordination namespace", () => {
	const workhorse = createWorkbenchThreadProfile({
		role: "workhorse",
		serviceName: "host",
		threadSource: "host",
		domainInstructions: "Host",
		dynamicTools: [],
	});
	expect(() =>
		createWorkbenchThreadProfile({
			role: "workhorse",
			serviceName: "host",
			threadSource: "host",
			domainInstructions: "Host",
			dynamicTools: [...workhorse.dynamicTools],
		}),
	).toThrow(TypeError);
});

test("application encoding accepts opaque host data while core execution validation stays authoritative", () => {
	const input = { ...context(), hostData: { project: "Independent app", authorize: true } };
	let frozen = false;
	const codec = {
		key: "independent-app",
		turnTrigger: "independent-app",
		encode: (value: WorkbenchExecutionContext) => {
			frozen = Object.isFrozen(value) && Object.isFrozen(value.child);
			return '{"project":"Independent app"}';
		},
	};
	const params = createWorkbenchTurnStartParams(
		{ threadId: "worker", clientUserMessageId: "message", prompt: "Do the work", context: input },
		codec,
	);
	expect(params.turnTrigger).toBe("independent-app");
	expect(params.additionalContext).toEqual({
		"independent-app": { kind: "application", value: '{"project":"Independent app"}' },
	});
	expect(frozen).toBe(true);
	expect(Object.isFrozen(params.input)).toBe(true);
	expect(Object.isFrozen(params.input[0]?.text_elements)).toBe(true);
	expect(() =>
		createWorkbenchTurnStartParams(
			{
				threadId: "worker",
				clientUserMessageId: "message",
				prompt: "Do the work",
				context: { ...input, child: { id: "", epoch: "epoch" } },
			},
			codec,
		),
	).toThrow();
});

function withManifest(profile: WorkbenchThreadProfile, dynamicTools: typeof profile.dynamicTools) {
	return {
		...profile,
		dynamicTools,
		manifestHash: createHash("sha256").update(JSON.stringify(dynamicTools), "utf8").digest("hex"),
	};
}

test("self-consistent profile hashes cannot authorize changed reserved namespaces", () => {
	for (const role of ["coordinator", "workhorse"] as const) {
		const profile = createWorkbenchThreadProfile({
			role,
			serviceName: "host",
			threadSource: "host",
			domainInstructions: "Host instructions.\n",
			dynamicTools: [],
		});
		for (const [index] of profile.dynamicTools.entries()) {
			const changed = profile.dynamicTools.map((tool, at) =>
				at === index ? { ...tool, description: "A host replacement descriptor." } : tool,
			);
			expect(() => captureThreadProfile(withManifest(profile, changed))).toThrow(TypeError);
		}
		expect(() =>
			captureThreadProfile(
				withManifest(profile, [...profile.dynamicTools, ...profile.dynamicTools]),
				role,
			),
		).toThrow(TypeError);
		expect(() => captureThreadProfile(withManifest(profile, []), role)).toThrow(TypeError);
		expect(captureThreadProfile(profile, role)).toEqual(profile);
	}
});

test("self-consistent instruction hashes cannot replace the known role's core instructions", () => {
	for (const role of ["coordinator", "workhorse"] as const) {
		const profile = createWorkbenchThreadProfile({
			role,
			serviceName: "host",
			threadSource: "host",
			domainInstructions: "Host instructions.\n",
			dynamicTools: [],
		});
		const otherRole = role === "coordinator" ? "workhorse" : "coordinator";
		for (const text of [
			"Host instructions.\n",
			`${CORE_ROLE_INSTRUCTIONS[role].slice(1)}\nHost instructions.\n`,
			`${CORE_ROLE_INSTRUCTIONS[otherRole]}\nHost instructions.\n`,
		]) {
			const instructions = {
				text,
				sha256: createHash("sha256").update(text, "utf8").digest("hex"),
			};
			expect(() => captureThreadProfile({ ...profile, instructions }, role)).toThrow(TypeError);
		}
	}
});

test("the known role requires its own built-in tools and rejects another role's reserved host tools", () => {
	const workhorse = createWorkbenchThreadProfile({
		role: "workhorse",
		serviceName: "host",
		threadSource: "host",
		domainInstructions: "Host",
		dynamicTools: [],
	});
	const coordinator = createWorkbenchThreadProfile({
		role: "coordinator",
		serviceName: "host",
		threadSource: "host",
		domainInstructions: "Host",
		dynamicTools: [],
	});
	expect(() => captureThreadProfile(workhorse, "coordinator")).toThrow(TypeError);
	expect(() => captureThreadProfile(coordinator, "workhorse")).toThrow(TypeError);
	for (const [profile, role] of [
		[workhorse, "workhorse"],
		[coordinator, "coordinator"],
	] as const) {
		expect(() =>
			captureThreadProfile(
				withManifest(profile, [...workhorse.dynamicTools, ...coordinator.dynamicTools]),
				role,
			),
		).toThrow(TypeError);
	}
	expect(() =>
		createWorkbenchThreadProfile({
			role: "coordinator",
			serviceName: "host",
			threadSource: "host",
			domainInstructions: "Host",
			dynamicTools: workhorse.dynamicTools,
		}),
	).toThrow(TypeError);
});
