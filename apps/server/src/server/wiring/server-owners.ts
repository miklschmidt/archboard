import { createAgentActivity } from "#server/panes/announcements/state/agent-activity.ts";
import { broadcastEverywhere } from "#server/panes/connections/state/pane-vaults.ts";
import { SERVER_LIFECYCLE_MS } from "@archboard/timing";
import {
	createServerMutationAdmission,
	type ServerMutationLease,
} from "#server/start-stop/lifecycle/application-lifetime.ts";
import { createCheckoutWorkOwner } from "#server/start-stop/services/checkout-work.ts";
import type { Request } from "express";
import { createCodeCheck } from "@archboard/code-intel/code-check-run";

/** Admits mutation requests while the server is running and drains them when it stops. */
const mutationAdmission = createServerMutationAdmission({
	drainTimeoutMs: SERVER_LIFECYCLE_MS.mutationDrain,
});

/** The lease each admitted mutation request holds, so its later work can be tracked. */
const admittedMutations = new WeakMap<Request, ServerMutationLease>();

/** Owns machine-local checkout snapshots so shutdown can quiesce them. */
const checkoutWork = createCheckoutWorkOwner();

/** The server's one code check, so its facts and its memory of behind serve every route that reads code. */
const codeCheck = createCodeCheck();

/** Owns canonical activity subscriptions, snapshots, and idle timers. */
const agentActivity = createAgentActivity(broadcastEverywhere);

export { admittedMutations, checkoutWork, codeCheck, mutationAdmission, agentActivity };
