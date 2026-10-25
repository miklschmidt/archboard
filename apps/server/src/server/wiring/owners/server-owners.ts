import { SERVER_LIFECYCLE_MS } from "@archboard/timing";
import {
	createServerMutationAdmission,
	type ServerMutationLease,
} from "#server/lifecycle/lifetime/application-lifetime.ts";
import { createCheckoutWorkOwner } from "#server/services/checkout-work/checkout-work.ts";
import type { Request } from "express";

/** Admits mutation requests while the server is running and drains them when it stops. */
const mutationAdmission = createServerMutationAdmission({
	drainTimeoutMs: SERVER_LIFECYCLE_MS.mutationDrain,
});

/** The lease each admitted mutation request holds, so its later work can be tracked. */
const admittedMutations = new WeakMap<Request, ServerMutationLease>();

/** Owns machine-local checkout snapshots so shutdown can quiesce them. */
const checkoutWork = createCheckoutWorkOwner();

export { admittedMutations, checkoutWork, mutationAdmission };
