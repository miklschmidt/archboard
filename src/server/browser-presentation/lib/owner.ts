import express from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { boardFilesMessage, readBoardContent } from "../../../runtime/engine/board-io.js";
import logger from "../../../runtime/engine/logger.js";
import { resolvePaneSpec } from "../../../runtime/engine/panes.js";
import type { PaneRegistration } from "../../../runtime/engine/panes.js";
import { presentElements } from "../../../runtime/engine/presentation.js";
import { boards } from "../../../runtime/engine/board-store.js";
import type { WebSocketMessage } from "../../../runtime/engine/types.js";
import { mintId } from "../../../shared/ids/ids.js";
import {
	BROWSER_CAPTURE_COLLECTION_MS,
	BROWSER_CAPTURE_DISPATCH_MS,
	BROWSER_EXPORT_TIMEOUT_MS,
	BROWSER_VIEWPORT_SETTLEMENT_MS,
} from "../../../shared/timing/timing.js";

type BrowserPane = Readonly<
	Omit<PaneRegistration, "rect" | "viewport"> & {
		readonly rect: Readonly<PaneRegistration["rect"]>;
		readonly viewport: Readonly<PaneRegistration["viewport"]>;
	}
>;
type PresentationCheckoutSnapshot = NonNullable<
	Parameters<typeof presentElements>[1]["checkoutSnapshot"]
>;
type BrowserPresentationResponse = Readonly<
	Pick<
		Response<unknown, { readonly checkoutSnapshot?: PresentationCheckoutSnapshot | null }>,
		"json" | "locals" | "status"
	>
>;
interface BrowserPresentationDependencies {
	readonly panes: () => readonly BrowserPane[];
	readonly browserCount: () => number;
	readonly boardForPane: (pane: BrowserPane) => string;
	readonly sendToPane: (
		clientId: string,
		message: Readonly<WebSocketMessage>,
		board: string,
	) => boolean;
	readonly checkoutSnapshotFor: (
		response: BrowserPresentationResponse,
	) => PresentationCheckoutSnapshot;
	readonly statusForError: (error: unknown) => number;
	readonly browserRequiredBody: (what: string) => Record<string, unknown>;
}

interface CaptureResult {
	readonly format: string;
	readonly data: string;
}

interface PendingBrowserCapture {
	readonly resolve: (data: Readonly<CaptureResult>) => void;
	readonly reject: (error: Readonly<Error>) => void;
	readonly timeout: ReturnType<typeof setTimeout>;
	dispatchTimeout: ReturnType<typeof setTimeout> | null;
	collectionTimeout: ReturnType<typeof setTimeout> | null;
	bestResult: CaptureResult | null;
}

interface ViewportResult {
	readonly success: boolean;
	readonly message: string;
}

interface PendingViewport {
	readonly resolve: (data: Readonly<ViewportResult>) => void;
	readonly reject: (error: Readonly<Error>) => void;
	readonly timeout: ReturnType<typeof setTimeout>;
}

const viewportRequestBodySchema = z.object({
	scrollToContent: z.boolean().optional(),
	scrollToElementIds: z.array(z.string().min(1)).min(1).optional(),
	viewportZoomFactor: z.number().positive().max(1).optional(),
	scrollToElementId: z.string().min(1).optional(),
	zoom: z.number().min(0.1).max(10).optional(),
	offsetX: z.number().optional(),
	offsetY: z.number().optional(),
	pane: z.string().min(1).optional(),
});
type ViewportRequestBody = Readonly<
	Omit<z.output<typeof viewportRequestBodySchema>, "scrollToElementIds"> & {
		readonly scrollToElementIds?: readonly string[] | undefined;
	}
>;
const viewportRequestSchema = viewportRequestBodySchema.superRefine(
	(params: ViewportRequestBody, context: Readonly<Pick<z.RefinementCtx, "addIssue">>) => {
		const modes = [
			params.scrollToContent === true,
			params.scrollToElementIds !== undefined,
			params.scrollToElementId !== undefined,
			params.zoom !== undefined || params.offsetX !== undefined || params.offsetY !== undefined,
		].filter(Boolean).length;
		if (modes !== 1) {
			context.addIssue({
				code: "custom",
				message:
					"Specify exactly one viewport mode: scrollToContent, scrollToElementIds, scrollToElementId, or manual zoom/offset",
			});
		}
		if (
			params.viewportZoomFactor !== undefined &&
			params.scrollToContent !== true &&
			params.scrollToElementIds === undefined
		) {
			context.addIssue({
				code: "custom",
				path: ["viewportZoomFactor"],
				message: "viewportZoomFactor requires scrollToContent or scrollToElementIds",
			});
		}
	},
);

const captureRequestSchema = z.object({
	format: z.unknown().optional(),
	background: z.unknown().optional(),
	pane: z.unknown().optional(),
});
const captureResultSchema = z.object({
	requestId: z.unknown().optional(),
	format: z.unknown().optional(),
	data: z.unknown().optional(),
	error: z.unknown().optional(),
});
const viewportResultSchema = z.object({
	requestId: z.unknown().optional(),
	success: z.unknown().optional(),
	message: z.unknown().optional(),
	error: z.unknown().optional(),
});

type BrowserRequest = Readonly<Pick<Request<Record<string, string>, unknown, unknown>, "body">>;

function errorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return typeof error === "string" ? error : "Unknown browser presentation error";
}

function validationMessages(
	issues: readonly Readonly<Pick<z.ZodError["issues"][number], "message">>[],
): string {
	return issues.map((issue) => issue.message).join("; ");
}

function viewportFailureMessage(error: unknown, message: unknown): string {
	if (typeof error === "string" && error.length > 0) {
		return error;
	}
	return typeof message === "string" && message.length > 0 ? message : "Viewport update failed";
}

function createBrowserPresentationOwner(dependencies: BrowserPresentationDependencies): {
	readonly router: express.Router;
	readonly stop: () => void;
} {
	const createRouter = express.Router;
	const router = createRouter();
	const pendingCaptures = new Map<string, PendingBrowserCapture>();
	const pendingViewports = new Map<string, PendingViewport>();

	const primaryPane = (): BrowserPane | null => {
		const panes = dependencies.panes();
		return panes.find((pane) => pane.primary) ?? panes[0] ?? null;
	};
	const capturePane = (spec: unknown): BrowserPane | null => {
		const panes = dependencies.panes();
		return typeof spec === "string" && spec.trim()
			? resolvePaneSpec([...panes], spec)
			: primaryPane();
	};

	router.post(
		"/api/browser/capture",
		(request: BrowserRequest, response: BrowserPresentationResponse) => {
			try {
				const { format, background, pane } = captureRequestSchema.parse(request.body ?? {});
				if (typeof format !== "string" || !["png", "svg"].includes(format)) {
					return response.status(400).json({
						success: false,
						error: 'format must be "png" or "svg"',
					});
				}
				if (dependencies.browserCount() === 0) {
					return response
						.status(503)
						.json(dependencies.browserRequiredBody("Taking a picture of the canvas"));
				}
				const answering = capturePane(pane);
				if (answering === null) {
					return response
						.status(503)
						.json(dependencies.browserRequiredBody("Taking a picture of the canvas"));
				}

				// Resolve and present the board before allocating correlated work. A stale
				// pane or unreadable note therefore cannot leave an orphaned promise/timer.
				const captureKey = dependencies.boardForPane(answering);
				const captureBoard = boards.get(captureKey);
				if (captureBoard === undefined) {
					return response.status(409).json({
						success: false,
						error: `The pane being pictured is showing "${captureKey}", which this canvas no longer holds.`,
					});
				}
				const captureContent = readBoardContent(captureBoard);
				const refresh: WebSocketMessage = {
					type: "initial_elements",
					board: captureKey,
					identity: captureBoard.identity,
					elements: presentElements(captureContent.elements.values(), {
						boardKey: captureKey,
						checkoutSnapshot: dependencies.checkoutSnapshotFor(response),
					}),
					...boardFilesMessage(captureContent),
				};

				const requestId = mintId(pendingCaptures);
				const capturePromise = new Promise<CaptureResult>((resolve, reject) => {
					const timeout = setTimeout(() => {
						const pending = pendingCaptures.get(requestId);
						pendingCaptures.delete(requestId);
						if (pending?.dispatchTimeout !== null && pending?.dispatchTimeout !== undefined) {
							clearTimeout(pending.dispatchTimeout);
						}
						if (pending?.collectionTimeout !== null && pending?.collectionTimeout !== undefined) {
							clearTimeout(pending.collectionTimeout);
						}
						if (pending?.bestResult) {
							resolve(pending.bestResult);
						} else {
							reject(new Error("Browser capture timed out after 30 seconds"));
						}
					}, BROWSER_EXPORT_TIMEOUT_MS);
					pendingCaptures.set(requestId, {
						resolve,
						reject,
						timeout,
						dispatchTimeout: null,
						collectionTimeout: null,
						bestResult: null,
					});
				});
				void capturePromise
					.then((result) =>
						response.json({ success: true, format: result.format, data: result.data }),
					)
					.catch((error: unknown) =>
						response.status(500).json({ success: false, error: errorMessage(error) }),
					);

				// Address only the selected pane: broadcasting this refresh would replace
				// every other pane's scene with the board being photographed.
				dependencies.sendToPane(answering.clientId, refresh, captureKey);
				const pending = pendingCaptures.get(requestId);
				if (pending !== undefined) {
					// Let the selected pane render the refresh before asking it to export.
					pending.dispatchTimeout = setTimeout(() => {
						pending.dispatchTimeout = null;
						dependencies.sendToPane(
							answering.clientId,
							{
								type: "browser_capture_request",
								requestId,
								format,
								background: typeof background === "boolean" ? background : true,
							},
							captureKey,
						);
					}, BROWSER_CAPTURE_DISPATCH_MS);
				}
			} catch (error) {
				logger.error("Error initiating browser capture:", error);
				response.status(dependencies.statusForError(error)).json({
					success: false,
					error: errorMessage(error),
				});
			}
			return null;
		},
	);

	router.post(
		"/api/browser/capture/result",
		(request: BrowserRequest, response: BrowserPresentationResponse) => {
			try {
				const { requestId, format, data, error } = captureResultSchema.parse(request.body);
				const reportedError: unknown = error;
				const hasError = Boolean(reportedError);
				if (typeof requestId !== "string" || requestId.length === 0) {
					return response.status(400).json({ success: false, error: "requestId is required" });
				}
				const pending = pendingCaptures.get(requestId);
				if (pending === undefined) {
					return response.json({ success: true });
				}
				if (hasError) {
					// One pane can fail while another still returns a usable capture.
					logger.warn(
						`Browser capture error from one client (requestId=${requestId}): ${errorMessage(error)}`,
					);
					return response.json({ success: true });
				}
				if (typeof format !== "string" || typeof data !== "string") {
					throw new TypeError(
						"format and data are required for a successful browser capture result",
					);
				}
				// Keep the largest response through the short collection window: it is the
				// most complete canvas when several clients answer one request.
				if (pending.bestResult === null || data.length > pending.bestResult.data.length) {
					pending.bestResult = { format, data };
				}
				pending.collectionTimeout ??= setTimeout(() => {
					const collected = pendingCaptures.get(requestId);
					if (collected?.bestResult) {
						clearTimeout(collected.timeout);
						if (collected.dispatchTimeout !== null) {
							clearTimeout(collected.dispatchTimeout);
						}
						pendingCaptures.delete(requestId);
						collected.resolve(collected.bestResult);
					}
				}, BROWSER_CAPTURE_COLLECTION_MS);
				response.json({ success: true });
			} catch (error) {
				logger.error("Error processing browser capture result:", error);
				response.status(500).json({ success: false, error: errorMessage(error) });
			}
			return null;
		},
	);

	router.post("/api/viewport", (request: BrowserRequest, response: BrowserPresentationResponse) => {
		try {
			const input = viewportRequestSchema.parse(request.body);
			if (dependencies.browserCount() === 0) {
				return response.status(503).json(dependencies.browserRequiredBody("Moving the camera"));
			}
			const answering =
				input.pane === undefined
					? primaryPane()
					: resolvePaneSpec([...dependencies.panes()], input.pane);
			if (answering === null) {
				return response.status(503).json(dependencies.browserRequiredBody("Moving the camera"));
			}
			const requestId = mintId(pendingViewports);
			const viewportPromise = new Promise<ViewportResult>((resolve, reject) => {
				const timeout = setTimeout(() => {
					pendingViewports.delete(requestId);
					reject(new Error("Viewport request timed out after 10 seconds"));
				}, BROWSER_VIEWPORT_SETTLEMENT_MS);
				pendingViewports.set(requestId, { resolve, reject, timeout });
			});
			void viewportPromise
				.then((result) => response.json(result))
				.catch((error: unknown) =>
					response.status(500).json({ success: false, error: errorMessage(error) }),
				);
			const { pane: _pane, ...message } = input;
			dependencies.sendToPane(
				answering.clientId,
				{ type: "set_viewport", requestId, ...message },
				dependencies.boardForPane(answering),
			);
		} catch (error) {
			logger.error("Error initiating viewport change:", error);
			response.status(error instanceof z.ZodError ? 400 : dependencies.statusForError(error)).json({
				success: false,
				error: error instanceof z.ZodError ? validationMessages(error.issues) : errorMessage(error),
			});
		}
		return null;
	});

	router.post(
		"/api/viewport/result",
		(request: BrowserRequest, response: BrowserPresentationResponse) => {
			try {
				const { requestId, success, message, error } = viewportResultSchema.parse(request.body);
				const reportedError: unknown = error;
				const hasError = Boolean(reportedError);
				if (typeof requestId !== "string" || requestId.length === 0) {
					return response.status(400).json({ success: false, error: "requestId is required" });
				}
				const pending = pendingViewports.get(requestId);
				if (pending === undefined) {
					return response.json({ success: true });
				}
				clearTimeout(pending.timeout);
				pendingViewports.delete(requestId);
				if (hasError || success === false) {
					pending.reject(new Error(viewportFailureMessage(error, message)));
					return response.json({ success: true });
				}
				pending.resolve({
					success: true,
					message: typeof message === "string" && message.length > 0 ? message : "Viewport updated",
				});
				response.json({ success: true });
			} catch (error) {
				logger.error("Error processing viewport result:", error);
				response.status(500).json({ success: false, error: errorMessage(error) });
			}
			return null;
		},
	);

	const stop = (): void => {
		const captures = [...pendingCaptures.values()];
		const viewports = [...pendingViewports.values()];
		for (const pending of captures) {
			clearTimeout(pending.timeout);
			if (pending.dispatchTimeout !== null) {
				clearTimeout(pending.dispatchTimeout);
			}
			if (pending.collectionTimeout !== null) {
				clearTimeout(pending.collectionTimeout);
			}
		}
		for (const pending of viewports) {
			clearTimeout(pending.timeout);
		}
		pendingCaptures.clear();
		pendingViewports.clear();
		for (const pending of captures) {
			pending.reject(new Error("Canvas stopped before the browser capture completed."));
		}
		for (const pending of viewports) {
			pending.reject(new Error("Canvas stopped before the viewport move completed."));
		}
	};

	return { router, stop };
}

export { createBrowserPresentationOwner };
export type { BrowserPresentationDependencies, BrowserPresentationResponse };
