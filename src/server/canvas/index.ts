import type * as CanvasApplication from "./lib/application.js";

/** Load one canvas application generation without caching a previous reload. */
export async function loadCanvasApplication(cacheKey = ""): Promise<typeof CanvasApplication> {
	return import(`./lib/application.js${cacheKey}`);
}
