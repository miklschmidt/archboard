import type { TransportServerNotification } from "@archboard/codex-app-server/transport";
import type { IdentityAuthority } from "@archboard/codex-app-server/identity";
import type { Fixture } from "#tests/runtime/operations/workhorse-operations/support.ts";
import { turn } from "#tests/runtime/operations/workhorse-operations/support.ts";

function rawTurn(
	identity: IdentityAuthority,
	rawId: string,
	status: "inProgress" | "completed" | "interrupted" | "failed",
	clientId: string,
): unknown {
	return { ...turn(identity, rawId, status, clientId), id: rawId };
}

function notification(fixtureValue: Fixture, value: unknown): TransportServerNotification {
	return {
		correlation: {
			child: fixtureValue.identity.validator.childId,
			epoch: fixtureValue.identity.validator.epoch,
			requestId: fixtureValue.identity.issuer.mintJsonRpcRequestId(),
		},
		notification: value as TransportServerNotification["notification"],
	};
}

async function rejected(promise: Promise<unknown>): Promise<unknown> {
	try {
		await promise;
		throw new Error("expected rejection");
	} catch (error) {
		return error;
	}
}

async function flush(): Promise<void> {
	for (let index = 0; index < 8; index += 1) {
		await Promise.resolve();
	}
}

export { rawTurn, notification, rejected, flush };
