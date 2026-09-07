import express from "express";
import type { Response } from "express";
import { z } from "zod";
import { boardFilesMessage, readBoardContent } from "@/runtime/engine/board-io";
import { logger } from "@/runtime/engine/logger";
import { resolvePaneSpec } from "@/runtime/engine/panes";
import type { PaneRegistration } from "@/runtime/engine/panes";
import { presentElements } from "@/runtime/engine/presentation";
import { boards } from "@/runtime/engine/board-store";
import type { WebSocketMessage } from "@/runtime/engine/types";
import { mintId } from "@/shared/ids/ids";
import {
	BROWSER_CAPTURE_COLLECTION_MS,
	BROWSER_CAPTURE_DISPATCH_MS,
	BROWSER_EXPORT_TIMEOUT_MS,
	BROWSER_VIEWPORT_SETTLEMENT_MS,
} from "@/shared/timing/timing";
import type {
	CaptureResult,
	PendingBrowserCapture,
	PendingViewport,
	ViewportResult,
} from "@/server/browser-presentation/lib/pending-work";
import {
	captureFormat,
	captureResultSchema,
	clearCaptureFollowUps,
	errorMessage,
	keepLargestCapture,
	parseCaptureRequest,
	reportedRequestId,
	successfulCapture,
	validationMessages,
	viewportFailureMessage,
	viewportRequestSchema,
	viewportResultSchema,
	viewportSuccessMessage,
	type BrowserRequest,
} from "@/server/browser-presentation/lib/requests";

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

/**
 * Builds the routes that ask a pane for a picture or a camera move and collect its answer.
 * @param dependencies The canvas facts and pane messaging the routes rely on.
 * @returns The router and the stop that rejects everything still pending.
 */
function createBrowserPresentationOwner(dependencies: BrowserPresentationDependencies): {
	readonly router: express.Router;
	readonly stop: () => void;
} {
	const createRouter = express.Router;
	const router = createRouter();
	const pendingCaptures = new Map<string, PendingBrowserCapture>();
	const pendingViewports = new Map<string, PendingViewport>();

	/**
	 * Picks the pane that answers when a request names none.
	 * @returns The primary pane, else the first registered, else null.
	 */
	const primaryPane = (): BrowserPane | null => {
		const panes = dependencies.panes();
		return panes.find((pane) => pane.primary) ?? panes[0] ?? null;
	};
	/**
	 * Picks the pane a capture request addresses.
	 * @param spec The request's pane field.
	 * @returns The named pane, the primary pane when none is named, or null with no browser.
	 */
	const capturePane = (spec: unknown): BrowserPane | null => {
		if (dependencies.browserCount() === 0) {
			return null;
		}
		const panes = dependencies.panes();
		return typeof spec === "string" && spec.trim()
			? resolvePaneSpec([...panes], spec)
			: primaryPane();
	};
	/**
	 * Picks the pane a viewport request addresses.
	 * @param spec The request's pane field.
	 * @returns The named pane, the primary pane when none is named, or null with no browser.
	 */
	const viewportPane = (spec: string | undefined): BrowserPane | null => {
		if (dependencies.browserCount() === 0) {
			return null;
		}
		return spec === undefined ? primaryPane() : resolvePaneSpec([...dependencies.panes()], spec);
	};
	/**
	 * Settles an expired capture with the best answer collected, or a timeout.
	 * @param requestId The capture's id.
	 * @param resolve Settles the capture with a result.
	 * @param reject Settles the capture with the timeout.
	 */
	const expireCapture = (
		requestId: string,
		resolve: PendingBrowserCapture["resolve"],
		reject: PendingBrowserCapture["reject"],
	): void => {
		const pending = pendingCaptures.get(requestId);
		pendingCaptures.delete(requestId);
		if (pending !== undefined) {
			clearCaptureFollowUps(pending);
		}
		if (pending?.bestResult) {
			resolve(pending.bestResult);
		} else {
			reject(new Error("Browser capture timed out after 30 seconds"));
		}
	};
	/**
	 * Registers a capture and the promise that settles when a pane answers or it expires.
	 * @param requestId The capture's id.
	 * @returns The capture promise.
	 */
	const registerCapture = (requestId: string): Promise<CaptureResult> =>
		new Promise<CaptureResult>((resolve, reject) => {
			const timeout = setTimeout(
				() => expireCapture(requestId, resolve, reject),
				BROWSER_EXPORT_TIMEOUT_MS,
			);
			pendingCaptures.set(requestId, {
				resolve,
				reject,
				timeout,
				dispatchTimeout: null,
				collectionTimeout: null,
				bestResult: null,
			});
		});
	/**
	 * Settles a capture with the best answer collected during its collection window.
	 * @param requestId The capture's id.
	 */
	const collectCapture = (requestId: string): void => {
		const collected = pendingCaptures.get(requestId);
		if (collected?.bestResult) {
			clearTimeout(collected.timeout);
			if (collected.dispatchTimeout !== null) {
				clearTimeout(collected.dispatchTimeout);
			}
			pendingCaptures.delete(requestId);
			collected.resolve(collected.bestResult);
		}
	};
	/**
	 * Builds the refresh that puts the pictured board in front of the answering pane.
	 * @param captureKey The board being pictured.
	 * @param captureBoard The held board.
	 * @param response The response whose checkout snapshot presents the elements.
	 * @returns The initial-elements message.
	 */
	const refreshFor = (
		captureKey: string,
		captureBoard: NonNullable<ReturnType<typeof boards.get>>,
		response: BrowserPresentationResponse,
	): WebSocketMessage => {
		const captureContent = readBoardContent(captureBoard);
		return {
			type: "initial_elements",
			board: captureKey,
			identity: captureBoard.identity,
			elements: presentElements(captureContent.elements.values(), {
				boardKey: captureKey,
				checkoutSnapshot: dependencies.checkoutSnapshotFor(response),
			}),
			...boardFilesMessage(captureContent),
		};
	};
	/**
	 * Sends the pane its refresh, then the capture request once it has had time to render.
	 * @param answering The pane being pictured.
	 * @param captureKey The board being pictured.
	 * @param refresh The refresh message.
	 * @param request The capture's id, format and background.
	 * @param request.requestId The id the pane answers with.
	 * @param request.format Which image the pane is being asked for.
	 * @param request.background Whether the picture carries the board's background.
	 */
	const dispatchCapture = (
		answering: BrowserPane,
		captureKey: string,
		refresh: WebSocketMessage,
		request: { requestId: string; format: "png" | "svg"; background: unknown },
	): void => {
		// Address only the selected pane: broadcasting this refresh would replace
		// every other pane's scene with the board being photographed.
		dependencies.sendToPane(answering.clientId, refresh, captureKey);
		const pending = pendingCaptures.get(request.requestId);
		if (pending === undefined) {
			return;
		}
		// Let the selected pane render the refresh before asking it to export.
		pending.dispatchTimeout = setTimeout(() => {
			pending.dispatchTimeout = null;
			dependencies.sendToPane(
				answering.clientId,
				{
					type: "browser_capture_request",
					requestId: request.requestId,
					format: request.format,
					background: typeof request.background === "boolean" ? request.background : true,
				},
				captureKey,
			);
		}, BROWSER_CAPTURE_DISPATCH_MS);
	};

	router.post(
		"/api/browser/capture",
		(request: BrowserRequest, response: BrowserPresentationResponse) => {
			try {
				const { format, background, pane } = parseCaptureRequest(request.body);
				const wanted = captureFormat(format);
				if (wanted === null) {
					return response.status(400).json({
						success: false,
						error: 'format must be "png" or "svg"',
					});
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
				const refresh = refreshFor(captureKey, captureBoard, response);

				const requestId = mintId(pendingCaptures);
				void registerCapture(requestId)
					.then((result) =>
						response.json({ success: true, format: result.format, data: result.data }),
					)
					.catch((error: unknown) =>
						response.status(500).json({ success: false, error: errorMessage(error) }),
					);
				dispatchCapture(answering, captureKey, refresh, { requestId, format: wanted, background });
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
				const report = captureResultSchema.parse(request.body);
				const requestId = reportedRequestId(report.requestId);
				if (requestId === null) {
					return response.status(400).json({ success: false, error: "requestId is required" });
				}
				const pending = pendingCaptures.get(requestId);
				if (pending === undefined) {
					return response.json({ success: true });
				}
				if (report.error) {
					// One pane can fail while another still returns a usable capture.
					logger.warn(
						`Browser capture error from one client (requestId=${requestId}): ${errorMessage(report.error)}`,
					);
					return response.json({ success: true });
				}
				keepLargestCapture(pending, successfulCapture(report));
				// Keep the largest response through the short collection window: it is the
				// most complete canvas when several clients answer one request.
				pending.collectionTimeout ??= setTimeout(
					() => collectCapture(requestId),
					BROWSER_CAPTURE_COLLECTION_MS,
				);
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
			const answering = viewportPane(input.pane);
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
				const {
					requestId: reported,
					success,
					message,
					error,
				} = viewportResultSchema.parse(request.body);
				const requestId = reportedRequestId(reported);
				if (requestId === null) {
					return response.status(400).json({ success: false, error: "requestId is required" });
				}
				const pending = pendingViewports.get(requestId);
				if (pending === undefined) {
					return response.json({ success: true });
				}
				clearTimeout(pending.timeout);
				pendingViewports.delete(requestId);
				if (error || success === false) {
					pending.reject(new Error(viewportFailureMessage(error, message)));
					return response.json({ success: true });
				}
				pending.resolve({ success: true, message: viewportSuccessMessage(message) });
				response.json({ success: true });
			} catch (error) {
				logger.error("Error processing viewport result:", error);
				response.status(500).json({ success: false, error: errorMessage(error) });
			}
			return null;
		},
	);

	/** Rejects every capture and viewport move still waiting, clearing their timers first. */
	const stop = (): void => {
		const captures = [...pendingCaptures.values()];
		const viewports = [...pendingViewports.values()];
		for (const pending of captures) {
			clearTimeout(pending.timeout);
			clearCaptureFollowUps(pending);
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
