import { createTextUserInput } from "../../codex-instructions/index.js";
import type { ManageWorkhorseQueueRequest } from "../index.js";
import type { Fixture } from "./support.js";

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
