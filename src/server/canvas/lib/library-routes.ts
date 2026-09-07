import { Router as createRouter } from "express";
import type { RequestHandler, Router as ExpressRouter } from "express";
import { z } from "zod";
import { readLibrary, writeLibrary } from "@/runtime/engine/library";
import type { LibraryItem } from "@/runtime/engine/library";
import logger from "@/runtime/engine/logger";

const LibraryStatusSchema = z.enum(["published", "unpublished"]);
const OptionalLibraryStatusSchema = LibraryStatusSchema.optional();
const OptionalCreatedSchema = z.number().optional();
const OptionalNameSchema = z.string().optional();
const LibraryElementsSchema = z.array(z.unknown());
const LibraryWriteItemSchema = z.looseObject({
	id: z.string(),
	status: OptionalLibraryStatusSchema,
	elements: LibraryElementsSchema,
	created: OptionalCreatedSchema,
	name: OptionalNameSchema,
});
const LibraryWriteItemsSchema = z.array(LibraryWriteItemSchema);
const LibraryWriteSchema = z.object({ items: LibraryWriteItemsSchema });

type LibraryNotificationItem = Readonly<Omit<LibraryItem, "elements">> & {
	readonly elements: readonly unknown[];
};

type LibraryWriteInput = Readonly<
	Pick<z.infer<typeof LibraryWriteItemSchema>, "id" | "status" | "created" | "name">
> & {
	readonly elements: readonly unknown[];
};

interface LibraryChangedNotification {
	readonly type: "library_changed";
	readonly items: readonly LibraryNotificationItem[];
	readonly timestamp: string;
}

interface LibraryRouteDependencies {
	notifyLibraryChanged: (notification: LibraryChangedNotification) => void;
}

/**
 * What a library failure says.
 * @param error Whatever the library store threw.
 * @returns Its message, or its string form for a non-Error.
 */
function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Answer with the whole stencil library, which the browser reads when it mounts.
 * @param _request The request; the library is not board-scoped.
 * @param response Its response.
 */
const readLibraryRoute: RequestHandler = (_request, response): void => {
	try {
		const state = readLibrary();
		response.json({
			success: true,
			items: state.items,
			seeded: state.seeded,
			origins: state.origins,
			file: state.file,
			vaultBacked: state.vaultBacked,
		});
	} catch (error) {
		logger.error("Error reading library:", error);
		response.status(500).json({ success: false, error: errorMessage(error) });
	}
};

/**
 * One stored library item from what the browser sent, defaulting the fields
 * Excalidraw leaves out.
 * @param item The item as written.
 * @returns The item as stored.
 */
function libraryItemFromRequest(item: LibraryWriteInput): LibraryItem {
	return {
		id: item.id,
		status: item.status ?? "published",
		elements: [...item.elements],
		created: item.created ?? Date.now(),
		...(item.name === undefined || item.name.length === 0 ? {} : { name: item.name }),
	};
}

/**
 * Create the complete server-side stencil-library HTTP boundary.
 * @param dependencies Narrow notification boundary for successful writes.
 * @returns Router that owns both library endpoints.
 */
function createLibraryRouter(dependencies: Readonly<LibraryRouteDependencies>): ExpressRouter {
	const router = createRouter();
	router.get("/api/library", readLibraryRoute);
	/**
	 * Replace the library with what the browser sent, and tell every other tab.
	 *
	 * The browser sends the whole set because that is what Excalidraw provides
	 * it — there is no library delta to be had — and last write wins, which is
	 * honest for a palette two tabs are unlikely to edit at once.
	 * @param request The request.
	 * @param response Its response.
	 */
	const writeLibraryRoute: RequestHandler = (request, response): void => {
		try {
			const body = LibraryWriteSchema.parse(request.body ?? {});
			const state = writeLibrary(body.items.map(libraryItemFromRequest));

			dependencies.notifyLibraryChanged({
				type: "library_changed",
				items: state.items,
				timestamp: new Date().toISOString(),
			});
			response.json({
				success: true,
				count: state.items.length,
				file: state.file,
				vaultBacked: state.vaultBacked,
			});
		} catch (error) {
			logger.error("Error writing library:", error);
			response
				.status(error instanceof z.ZodError ? 400 : 500)
				.json({ success: false, error: errorMessage(error) });
		}
	};
	router.put("/api/library", writeLibraryRoute);
	return router;
}

export { createLibraryRouter };
export type { LibraryChangedNotification };
