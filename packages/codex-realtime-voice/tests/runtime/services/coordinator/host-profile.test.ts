import { expect, test } from "bun:test";
import * as NodeCrypto from "node:crypto";

import type { CodexCoordinatorOptions } from "#runtime/protocol/coordinator/contract.ts";
import type { WorkbenchThreadProfile } from "#runtime/protocol/host/instructions.ts";
import { createWorkbenchThreadProfile } from "#runtime/rules/host/instructions.ts";
import { createCodexCoordinator } from "#runtime/services/coordinator/coordinator.ts";
import {
	fixture,
	WORKING_DIRECTORY,
	type Fixture,
} from "#tests/runtime/services/coordinator/support.ts";

function profile(domainInstructions = "Host instructions with trailing spaces.  \n") {
	return createWorkbenchThreadProfile({
		role: "coordinator",
		identity: { serviceName: "test-host", threadSource: "test-host" },
		domainInstructions,
		dynamicTools: [
			{
				type: "function",
				name: "host_lookup",
				description: "Read host context.",
				inputSchema: { type: "object", additionalProperties: false, properties: {} },
				deferLoading: false,
			},
		],
	});
}

function coordinatorFor(
	value: Fixture,
	threadProfile: WorkbenchThreadProfile,
	persisted?: CodexCoordinatorOptions["persisted"],
) {
	const coordinator = createCodexCoordinator({
		session: value.session,
		threadLink: value.link,
		epoch: value.epoch,
		identity: value.authority,
		workingDirectory: WORKING_DIRECTORY,
		profile: threadProfile,
		...(persisted === undefined ? {} : { persisted }),
	});
	value.session.notify = coordinator.onNotification;
	return coordinator;
}

test("coordinator starts and replacements retain captured host bytes and their exact hashes", async () => {
	const value = fixture();
	const original = profile();
	const caller = {
		...original,
		instructions: { ...original.instructions },
		dynamicTools: structuredClone(original.dynamicTools),
	};
	const coordinator = coordinatorFor(value, caller);
	caller.instructions.text = "Changed after capture.";
	caller.dynamicTools.pop();

	const first = await coordinator.ensure({ operationId: "host-start" });
	value.session.nextThread("fresh-host-coordinator");
	const fresh = await coordinator.replace({
		operationId: "host-voice-replacement",
		onRetired: () => undefined,
	});

	expect(first.state).toBe("ready");
	expect(fresh.state).toBe("ready");
	expect(fresh.threadId).not.toBe(first.threadId);
	expect(value.session.startParams).toHaveLength(2);
	for (const params of value.session.startParams) {
		expect(params.developerInstructions).toBe(original.instructions.text);
		expect(params.dynamicTools).toEqual(original.dynamicTools);
		expect(fresh.review?.instructionHash).toBe(
			NodeCrypto.createHash("sha256")
				.update(params.developerInstructions ?? "", "utf8")
				.digest("hex"),
		);
		expect(fresh.review?.catalogueHash).toBe(
			NodeCrypto.createHash("sha256")
				.update(JSON.stringify(params.dynamicTools), "utf8")
				.digest("hex"),
		);
	}
});

test("coordinator refuses mismatched host hashes before requesting a thread", () => {
	const value = fixture();
	const original = profile();
	for (const candidate of [
		{ ...original, instructions: { ...original.instructions, text: "Unhashed instructions." } },
		{ ...original, dynamicTools: original.dynamicTools.slice(0, -1) },
	]) {
		expect(() => coordinatorFor(value, candidate)).toThrow(TypeError);
	}
	expect(value.session.modelRequests).toHaveLength(0);
	expect(value.session.startParams).toHaveLength(0);
});

test.each(["instructions", "tools"] as const)(
	"changed host %s prevent reuse of a retained coordinator",
	async (changed) => {
		const value = fixture();
		const original = profile();
		const coordinator = coordinatorFor(value, original);
		const first = await coordinator.ensure({ operationId: "original-host-start" });
		const next =
			changed === "instructions"
				? profile("Changed host instructions.\n")
				: createWorkbenchThreadProfile({
						role: "coordinator",
						identity: original.identity,
						domainInstructions: "Host instructions with trailing spaces.  \n",
						dynamicTools: [],
					});
		const replacement = coordinatorFor(value, next, first.persistence);
		value.session.nextThread("changed-host-coordinator");

		const fresh = await replacement.ensure({ operationId: "changed-host-start" });

		expect(fresh.state).toBe("ready");
		expect(fresh.threadId).not.toBe(first.threadId);
		expect(value.session.startParams).toHaveLength(2);
		expect(value.session.startParams[1]?.developerInstructions).toBe(next.instructions.text);
		expect(value.session.startParams[1]?.dynamicTools).toEqual(next.dynamicTools);
		expect(value.link.calls).toHaveLength(0);
	},
);
