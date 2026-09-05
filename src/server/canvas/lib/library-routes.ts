import type { Application, Request, Response } from "express";
import { z } from "zod";
import { readLibrary, writeLibrary } from "../../../runtime/engine/library.js";
import type { LibraryItem } from "../../../runtime/engine/library.js";
import logger from "../../../runtime/engine/logger.js";

const LibraryStatusSchema = z.enum(["published", "unpublished"]);
const OptionalLibraryStatusSchema = LibraryStatusSchema.optional();
const OptionalCreatedSchema = z.number().optional();
const OptionalNameSchema = z.string().optional();
const LibraryElementsSchema = z.array(z.any());
const LibraryWriteItemSchema = z.looseObject({
	id: z.string(),
	status: OptionalLibraryStatusSchema,
	elements: LibraryElementsSchema,
	created: OptionalCreatedSchema,
	name: OptionalNameSchema,
});
const LibraryWriteItemsSchema = z.array(LibraryWriteItemSchema);
const LibraryWriteSchema = z.object({ items: LibraryWriteItemsSchema });

interface LibraryChangedNotification {
	type: "library_changed";
	items: LibraryItem[];
	timestamp: string;
}

interface LibraryRouteDependencies {
	// eslint-disable-next-line typescript/prefer-readonly-parameter-types -- Notification must remain assignable to the mutable WebSocket wire contract.
	notifyLibraryChanged: (notification: Readonly<LibraryChangedNotification>) => void;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

// eslint-disable-next-line typescript/prefer-readonly-parameter-types -- Express owns mutable request/response objects.
function readLibraryRoute(_request: Request, response: Response): void {
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
}

function libraryItemFromRequest(
	// eslint-disable-next-line typescript/prefer-readonly-parameter-types -- Zod's inferred loose-object arrays are mutable at this parsing boundary.
	item: Readonly<z.infer<typeof LibraryWriteItemSchema>>,
): LibraryItem {
	return {
		id: item.id,
		status: item.status ?? "published",
		elements: item.elements,
		created: item.created ?? Date.now(),
		...(item.name === undefined || item.name.length === 0 ? {} : { name: item.name }),
	};
}

function writeLibraryRoute(
	// eslint-disable-next-line typescript/prefer-readonly-parameter-types -- Express owns mutable request state.
	request: Request,
	// eslint-disable-next-line typescript/prefer-readonly-parameter-types -- Express owns mutable response state.
	response: Response,
	notifyLibraryChanged: LibraryRouteDependencies["notifyLibraryChanged"],
): void {
	try {
		const body = LibraryWriteSchema.parse(request.body ?? {});
		const state = writeLibrary(body.items.map(libraryItemFromRequest));

		notifyLibraryChanged({
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
}

/**
 * Register the complete server-side stencil-library HTTP boundary.
 *
 * @param application Express application that owns the public routes.
 * @param dependencies Narrow notification boundary for successful writes.
 */
export function registerLibraryRoutes(
	// eslint-disable-next-line typescript/prefer-readonly-parameter-types -- Express owns mutable registration state.
	application: Application,
	dependencies: Readonly<LibraryRouteDependencies>,
): void {
	application.get("/api/library", readLibraryRoute);
	// eslint-disable-next-line typescript/prefer-readonly-parameter-types -- Express owns mutable request/response objects.
	application.put("/api/library", (request, response) => {
		writeLibraryRoute(request, response, dependencies.notifyLibraryChanged);
	});
}

export type { LibraryChangedNotification };
