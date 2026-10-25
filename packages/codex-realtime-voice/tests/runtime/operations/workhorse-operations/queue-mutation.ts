import { createTextUserInput } from "#runtime/rules/host/text-input.ts";
import { type ManageWorkhorseQueueRequest } from "#runtime/protocol/workhorse-operations/contract.ts";
import type { Fixture } from "#tests/runtime/operations/workhorse-operations/support.ts";

function queuedItem(fixtureValue: Fixture, id = "queue-target") {
	return {
		id: fixtureValue.identity.decoder.adoptQueuedSubmissionId(id),
		input: [createTextUserInput("queued")],
		clientUserMessageId: `client-${id}`,
	};
}

async function mutate(
	fixtureValue: Fixture,
	operation: Exclude<ManageWorkhorseQueueRequest["operation"], "list">,
) {
	const call = fixtureValue.setCall("manage_workhorse_queue");
	const target = fixtureValue.queue.state[0];
	switch (operation) {
		case "add":
			return fixtureValue.operations.manageQueue({ call, operation, prompt: "add" });
		case "update":
			if (target === undefined) {
				throw new Error("missing update target");
			}
			return fixtureValue.operations.manageQueue({
				call,
				operation,
				submissionId: target.id,
				prompt: "updated",
			});
		case "delete":
			if (target === undefined) {
				throw new Error("missing delete target");
			}
			return fixtureValue.operations.manageQueue({ call, operation, submissionId: target.id });
		case "reorder":
			if (target === undefined) {
				throw new Error("missing reorder target");
			}
			return fixtureValue.operations.manageQueue({
				call,
				operation,
				orderedSubmissionIds: [target.id],
			});
		case "start":
			if (target === undefined) {
				throw new Error("missing start target");
			}
			return fixtureValue.operations.manageQueue({ call, operation, submissionId: target.id });
	}
}

export { queuedItem, mutate };
