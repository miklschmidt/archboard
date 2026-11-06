import { createAgentActivity } from "#server/panes/announcements/state/agent-activity.ts";
import { broadcastEverywhere } from "#server/panes/connections/state/pane-vaults.ts";
import { SERVER_LIFECYCLE_MS } from "@archboard/timing";
import {
	createServerMutationAdmission,
	type ServerMutationLease,
} from "#server/start-stop/lifecycle/application-lifetime.ts";
import { createCheckoutWorkOwner } from "#server/start-stop/services/checkout-work.ts";
import type { Request } from "express";

/** Admits mutation requests while the server is running and drains them when it stops. */
const mutationAdmission = createServerMutationAdmission({
	drainTimeoutMs: SERVER_LIFECYCLE_MS.mutationDrain,
});

/** The lease each admitted mutation request holds, so its later work can be tracked. */
const admittedMutations = new WeakMap<Request, ServerMutationLease>();

/** Owns machine-local checkout snapshots so shutdown can quiesce them. */
const checkoutWork = createCheckoutWorkOwner();

/** Owns canonical activity subscriptions, snapshots, and idle timers. */
const agentActivity = createAgentActivity(broadcastEverywhere);

export { admittedMutations, checkoutWork, mutationAdmission, agentActivity };
