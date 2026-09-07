import type { Express, NextFunction, Request, Response } from "express";
import { z } from "zod";
import { CodeBindingSchema, type CodeBinding } from "@/shared/code-target";
import { boards } from "@/runtime/engine/board-store";
import type { BoardState } from "@/runtime/engine/board-store";
import { readBoardContent, resolveBoard, resolveBoardNote } from "@/runtime/engine/board-io";
import { boardKey } from "@/runtime/engine/board";
import { codeBindingsOf } from "@/runtime/engine/presentation";
import { snapshotCheckoutAccess, type CheckoutSnapshot } from "@/runtime/code-target";
import { checkoutWork } from "@/server/canvas/lib/canvas-owners";
import { trackMutationWork } from "@/server/canvas/lib/mutation-work";
import {
	BoardAddressSchema,
	boardOfRequest,
	bodyOf,
	identityFromAddress,
	isRecord,
	preparedBoardOpens,
} from "@/server/canvas/lib/request-board";

/** Human-only routes that never open a code target, so they take no checkout snapshot. */
const PROCESS_FREE_HUMAN_ROUTES = new Set([
	"/api/boards/hold",
	"/api/boards/hold/release",
	"/api/panes",
	"/api/selection",
]);

/** Routes whose renderer or opener work captures its own checkout authority. */
const SELF_SNAPSHOTTING_ROUTES = new Set([
	"/api/render/board",
	"/api/export/findings",
	"/api/elements/from-mermaid",
]);

/**
 * The code bindings of every board this canvas has open.
 * @returns Every binding, in board order.
 */
function openBoardBindings(): CodeBinding[] {
	const bindings: CodeBinding[] = [];
	for (const board of boards.values()) {
		try {
			bindings.push(...codeBindingsOf(readBoardContent(board).elements.values()));
		} catch {
			// A malformed board remains the route's own visible refusal.
		}
	}
	return bindings;
}

/**
 * The code binding one element-shaped record carries under
 * `customData.archboard.binding`, if it carries a valid one.
 * @param candidate The record.
 * @returns The binding, or null.
 */
function bindingOfRecord(candidate: Record<string, unknown>): CodeBinding | null {
	const custom = candidate["customData"];
	if (!isRecord(custom)) {
		return null;
	}
	const archboard = custom["archboard"];
	if (!isRecord(archboard)) {
		return null;
	}
	const parsed = CodeBindingSchema.safeParse(archboard["binding"]);
	return parsed.success ? parsed.data : null;
}

/**
 * Every code binding anywhere inside a request value, however it is nested.
 * @param value The request body or any part of it.
 * @returns The bindings found.
 */
function codeBindingsInValue(value: unknown): CodeBinding[] {
	const bindings: CodeBinding[] = [];
	const pending: unknown[] = [value];
	const seen = new Set<object>();
	while (pending.length > 0) {
		const candidate = pending.pop();
		if (!candidate || typeof candidate !== "object" || seen.has(candidate)) {
			continue;
		}
		seen.add(candidate);
		if (Array.isArray(candidate)) {
			pending.push(...candidate);
			continue;
		}
		if (isRecord(candidate)) {
			const binding = bindingOfRecord(candidate);
			if (binding) {
				bindings.push(binding);
			}
		}
		pending.push(...Object.values(candidate));
	}
	return bindings;
}

const BoardOpenSchema = BoardAddressSchema.extend({
	reload: z.boolean().optional(),
	pane: z.string().optional(),
});

/**
 * Whether this request is the board-open route.
 * @param req The request.
 * @returns True for `POST /api/boards/open`.
 */
function isBoardOpen(req: Request): boolean {
	return req.method === "POST" && req.path === "/api/boards/open";
}

/**
 * The bindings of a board the open route is about to read from the vault,
 * resolved from its note ahead of the route so the checkout snapshot can
 * cover them. The resolution is kept for the route, which then works from the
 * same load.
 * @param req The request.
 * @returns The bindings, or none when the request is not an open of an unopened board.
 */
function unopenedBoardBindings(req: Request): CodeBinding[] {
	if (!isBoardOpen(req)) {
		return [];
	}
	const parsed = BoardOpenSchema.safeParse(bodyOf(req));
	if (!parsed.success) {
		return [];
	}
	try {
		const key = boardKey(identityFromAddress(parsed.data));
		if (boards.has(key) && !parsed.data.reload) {
			return [];
		}
		const resolution = resolveBoardNote(key, "Opening a board");
		preparedBoardOpens.set(req, { key, resolution, reload: parsed.data.reload === true });
		return codeBindingsInValue(JSON.parse(resolution.loaded.sceneJson));
	} catch {
		// The route remains the authority for malformed or unavailable board input.
		return [];
	}
}

/**
 * The bindings of the board a request names, when it names one that resolves.
 * @param req The request.
 * @returns The bindings, or none.
 */
function namedBoardBindings(req: Request): CodeBinding[] {
	const named = isBoardOpen(req) ? undefined : boardOfRequest(req);
	if (!named) {
		return [];
	}
	try {
		return codeBindingsOf(resolveBoard(named).content.elements.values());
	} catch {
		// The route owns the typed board-resolution refusal.
		return [];
	}
}

/**
 * Every binding a request could touch: open boards, the named board, the body
 * and a board about to be opened.
 * @param req The request.
 * @returns The bindings the checkout snapshot must cover.
 */
function requestCheckoutBindings(req: Request): CodeBinding[] {
	return [
		...openBoardBindings(),
		...namedBoardBindings(req),
		...codeBindingsInValue(req.body),
		...unopenedBoardBindings(req),
	];
}

/**
 * Whether a request skips the checkout snapshot: reads outside `/api/`, routes
 * that snapshot for themselves, human-only routes, a pane's own change report
 * and the opener's settings and activation routes.
 * @param req The request.
 * @returns True when no snapshot is taken.
 */
function skipsCheckoutSnapshot(req: Request): boolean {
	if (!req.path.startsWith("/api/") || SELF_SNAPSHOTTING_ROUTES.has(req.path)) {
		return true;
	}
	if (req.method !== "GET" && PROCESS_FREE_HUMAN_ROUTES.has(req.path)) {
		return true;
	}
	if (req.method === "POST" && req.path === "/api/elements/changes") {
		return bodyOf(req)["origin"] !== "agent";
	}
	return req.path.startsWith("/api/settings/opener") || req.path === "/api/code-targets/open";
}

/**
 * Capture one checkout snapshot for a request, under the request's own
 * tracking: a read is tracked against the response, a mutation under its lease.
 * @param req The request.
 * @param res Its response.
 * @param bindings The bindings to cover.
 * @returns The snapshot.
 */
function captureCheckoutSnapshot(
	req: Request,
	res: Response,
	bindings: readonly CodeBinding[],
): Promise<CheckoutSnapshot> {
	const name = `${req.method} ${req.path} checkout snapshot`;
	if (req.method === "GET" || req.method === "HEAD") {
		return checkoutWork.trackRequest(req, res, name, (signal) =>
			snapshotCheckoutAccess({ signal, bindings }),
		);
	}
	return trackMutationWork(req, name, (signal) =>
		checkoutWork.track(name, signal, (ownedSignal) =>
			snapshotCheckoutAccess({ signal: ownedSignal, bindings }),
		),
	);
}

/**
 * Re-snapshot an already installed board until its bindings stop changing
 * under the capture, so a plain re-open works from a snapshot that covers
 * exactly what the board holds.
 * @param req The request.
 * @param res Its response.
 * @param installed The board already open.
 */
async function settleInstalledSnapshot(
	req: Request,
	res: Response,
	installed: BoardState,
): Promise<void> {
	let installedBindings = codeBindingsOf(readBoardContent(installed).elements.values());
	for (;;) {
		// oxlint-disable-next-line eslint(no-await-in-loop) -- each capture must see the bindings the previous one settled
		res.locals["checkoutSnapshot"] = await captureCheckoutSnapshot(req, res, installedBindings);
		const refreshed = codeBindingsOf(readBoardContent(installed).elements.values());
		if (JSON.stringify(refreshed) === JSON.stringify(installedBindings)) {
			return;
		}
		installedBindings = refreshed;
	}
}

/**
 * Resolve machine-local checkout authority before any board lock is taken.
 * Code-opener routes make their own snapshot at activation time, so settings
 * and activation can never share authority accidentally.
 * @param req The request.
 * @param res Its response, which carries the snapshot for the route.
 * @param next The next middleware.
 */
async function prepareCheckoutSnapshot(
	req: Request,
	res: Response,
	next: NextFunction,
): Promise<void> {
	if (skipsCheckoutSnapshot(req)) {
		return next();
	}
	res.locals["checkoutSnapshot"] = await captureCheckoutSnapshot(
		req,
		res,
		requestCheckoutBindings(req),
	);
	const prepared = preparedBoardOpens.get(req);
	const installed = prepared ? boards.get(prepared.key) : undefined;
	if (installed !== undefined && prepared?.reload === false) {
		await settleInstalledSnapshot(req, res, installed);
	}
	next();
}

/**
 * Mount the checkout snapshot middleware.
 * @param app The application to mount on.
 */
function mountCheckoutSnapshot(app: Express): void {
	app.use((req: Request, res: Response, next: NextFunction) => {
		void prepareCheckoutSnapshot(req, res, next).catch((error) => setImmediate(next, error));
	});
}

export { mountCheckoutSnapshot };
