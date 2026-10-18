import { SERVER_MUTATION_DRAIN_TIMEOUT_MS } from "@archboard/timing";
import {
	createServerMutationAdmission,
	type ServerMutationLease,
} from "@/server/archboard/lib/application-lifetime";
import { createCheckoutWorkOwner } from "@/server/archboard/lib/checkout-work";
import type { Request } from "express";

/** Admits mutation requests while the server is running and drains them when it stops. */
const mutationAdmission = createServerMutationAdmission({
	drainTimeoutMs: SERVER_MUTATION_DRAIN_TIMEOUT_MS,
});

/** The lease each admitted mutation request holds, so its later work can be tracked. */
const admittedMutations = new WeakMap<Request, ServerMutationLease>();

/** Owns machine-local checkout snapshots so shutdown can quiesce them. */
const checkoutWork = createCheckoutWorkOwner();

export { admittedMutations, checkoutWork, mutationAdmission };
