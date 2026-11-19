import type { Request, Response } from "express";

/**
 * Whether the caller has gone, so nothing is left to answer.
 * @param request The request.
 * @param response Its response.
 * @returns True when the response can no longer be written.
 */
function callerGone(request: Request, response: Response): boolean {
	return request.destroyed || response.destroyed || response.headersSent;
}

export { callerGone };
