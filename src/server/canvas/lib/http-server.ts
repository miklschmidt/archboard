import { createServer, type RequestListener, type Server } from "node:http";

/**
 * Construction seam for deterministic listen and runtime-failure owners.
 * @param listener The application that answers requests.
 * @returns The HTTP server, not yet listening.
 */
export function createCanvasHttpServer(listener: RequestListener): Server {
	return createServer(listener);
}
