import { createServer, type RequestListener, type Server } from "node:http";

/** Construction seam for deterministic listen and runtime-failure owners. */
export function createCanvasHttpServer(listener: RequestListener): Server {
	return createServer(listener);
}
