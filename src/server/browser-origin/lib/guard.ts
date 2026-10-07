import type { RequestHandler } from "express";
import { checkBrowserCsrf, type BrowserCsrfKind } from "@/server/browser-origin/lib/browser-csrf";

/**
 * Refuses browser requests from another origin before parsing or route effects.
 * @param kind Ordinary HTTP traffic, or the opener's stricter browser-only capability.
 * @returns The shared Express origin guard.
 */
function createBrowserOriginGuard(kind: BrowserCsrfKind = "request"): RequestHandler {
	return (request, response, next) => {
		const result = checkBrowserCsrf(kind, {
			protocol: request.protocol,
			host: request.get("host"),
			origin: request.get("origin"),
			referer: request.get("referer"),
			secFetchSite: request.get("sec-fetch-site"),
		});
		if (!result.ok) {
			response.status(403).json({ success: false, code: result.code, error: result.error });
			return;
		}
		next();
	};
}

export { createBrowserOriginGuard };
