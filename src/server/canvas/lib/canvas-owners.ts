import { CANVAS_MUTATION_DRAIN_TIMEOUT_MS } from "@/shared/timing/timing";
import { createBoardRenderingOwner } from "@/server/board-rendering";
import {
	createCanvasMutationAdmission,
	type CanvasMutationLease,
} from "@/server/canvas/lib/application-lifetime";
import { createCheckoutWorkOwner } from "@/server/canvas/lib/checkout-work";
import type { Request } from "express";

/** The one board renderer this process runs; the lifetime starts and stops it. */
const boardRenderer = createBoardRenderingOwner();

/** Admits mutation requests while the canvas is running and drains them when it stops. */
const mutationAdmission = createCanvasMutationAdmission({
	drainTimeoutMs: CANVAS_MUTATION_DRAIN_TIMEOUT_MS,
});

/** The lease each admitted mutation request holds, so its later work can be tracked. */
const admittedMutations = new WeakMap<Request, CanvasMutationLease>();

/** Owns machine-local checkout snapshots so shutdown can quiesce them. */
const checkoutWork = createCheckoutWorkOwner();

export { admittedMutations, boardRenderer, checkoutWork, mutationAdmission };
