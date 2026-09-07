import type { Express, NextFunction, Request, Response } from "express";
import { admittedMutations, mutationAdmission } from "@/server/canvas/lib/canvas-owners";

/**
 * Run one piece of work under the request's mutation lease, so shutdown's
 * drain waits for it. A request without a lease never passed admission and
 * cannot do mutation work at all.
 * @param req The admitted request.
 * @param name What the work is, for the health report and the drain log.
 * @param work The work itself, given the lease's abort signal.
 * @returns The work's result.
 */
function trackMutationWork<T>(
	req: Request,
	name: string,
	work: (signal: AbortSignal) => Promise<T> | T,
): Promise<T> {
	const lease = admittedMutations.get(req);
	if (!lease) {
		return Promise.reject(new Error(`${req.method} ${req.path} has no mutation lease.`));
	}
	return lease.track(name, work);
}

type AsyncEndpoint = (
	req: Request,
	res: Response,
	next: NextFunction,
	signal: AbortSignal,
) => Promise<unknown>;

/**
 * Whether the caller has gone, so nothing can be answered any more.
 * @param req The request.
 * @param res Its response.
 * @returns True when the request aborted or the response was destroyed.
 */
function callerGone(req: Request, res: Response): boolean {
	return req.aborted || res.destroyed;
}

/**
 * Wrap an async handler so its work runs under the mutation lease and its
 * failure reaches Express's error middleware rather than an unhandled rejection.
 * @param handler The handler, given the lease's abort signal.
 * @returns An ordinary Express handler.
 */
function asyncEndpoint(
	handler: AsyncEndpoint,
): (req: Request, res: Response, next: NextFunction) => void {
	return (req, res, next) => {
		void trackMutationWork(req, `${req.method} ${req.path} handler`, (signal) =>
			handler(req, res, next, signal),
		).catch((error) => {
			if (callerGone(req, res)) {
				return;
			}
			setImmediate(next, error);
		});
	};
}

/**
 * Whether a request could change something and so needs admission.
 * @param req The request.
 * @returns True for every non-read request under `/api/`.
 */
function isMutationRequest(req: Request): boolean {
	return req.method !== "GET" && req.method !== "HEAD" && req.path.startsWith("/api/");
}

/**
 * Mount the admission middleware: it precedes every mutation-specific guard
 * and body parser. Parsing is one request lease; explicit async route and
 * board-lock work takes a second lease so disconnecting the response cannot
 * make unfinished mutation work disappear from shutdown's authoritative drain.
 * @param app The application to mount on.
 */
function mountMutationAdmission(app: Express): void {
	app.use((req: Request, res: Response, next: NextFunction) => {
		if (!isMutationRequest(req)) {
			return next();
		}
		const name = `${req.method} ${req.path}`;
		const lease = mutationAdmission.admit(name);
		if (lease === null) {
			res.setHeader("Retry-After", "1");
			res.status(503).json({
				success: false,
				code: "CANVAS_STOPPING",
				error:
					"The canvas is checking whether it can stop and is not accepting writes. " +
					"If the canvas remains running, retry after resolving any held board it reports.",
			});
			return;
		}
		admittedMutations.set(req, lease);
		req.once("aborted", () => lease.abort(new Error(`${name} request body was aborted.`)));
		res.once("finish", () => lease.finish());
		res.once("close", () => {
			if (res.writableFinished) {
				lease.finish();
			} else {
				lease.abort(new Error(`${name} response disconnected.`));
			}
		});
		next();
	});
}

export { asyncEndpoint, callerGone, mountMutationAdmission, trackMutationWork };
