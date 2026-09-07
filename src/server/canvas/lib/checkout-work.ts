import type { Request, Response } from "express";

interface ActiveCheckoutWork {
	readonly controller: AbortController;
	promise: Promise<unknown> | null;
}

type CheckoutSignal = Readonly<AbortSignal>;
type CheckoutRequest = Readonly<Pick<Request, "method" | "path" | "once" | "off">>;
type CheckoutResponse = Readonly<Pick<Response, "once" | "off">>;

type CheckoutTask<T> = (signal: CheckoutSignal) => Promise<T>;

type CheckoutTracker = <T>(
	name: string,
	externalSignal: CheckoutSignal | undefined,
	work: CheckoutTask<T>,
) => Promise<T>;

type RequestCheckoutTracker = <T>(
	request: CheckoutRequest,
	response: CheckoutResponse,
	name: string,
	work: CheckoutTask<T>,
) => Promise<T>;

interface CheckoutWorkOwner {
	readonly track: CheckoutTracker;
	readonly trackRequest: RequestCheckoutTracker;
	readonly quiesce: () => void;
	readonly resume: () => void;
	readonly stop: () => Promise<void>;
}

/**
 * The owner of this canvas's machine-local checkout work: it admits work while
 * the canvas is running, cancels it when a request disconnects, and lets
 * shutdown wait for what is already in flight.
 * @returns The owner.
 */
function createCheckoutWorkOwner(): CheckoutWorkOwner {
	let accepting = true;
	const active = new Set<ActiveCheckoutWork>();

	/**
	 * Run one piece of checkout work under a cancellable signal of its own,
	 * refusing it once the canvas has stopped admitting work.
	 * @param name What the work is, for the refusal and the cancellation.
	 * @param externalSignal A caller's signal that also cancels it, if it has one.
	 * @param work The work.
	 * @returns The work's result.
	 */
	function track<T>(
		name: string,
		externalSignal: CheckoutSignal | undefined,
		work: CheckoutTask<T>,
	): Promise<T> {
		if (!accepting) {
			return Promise.reject(
				new Error(`Canvas checkout work is stopping; ${name} was not admitted.`),
			);
		}
		const controller = new AbortController();
		/** Cancel this work with the caller's reason, or one naming the work. */
		const cancel = (): void => {
			controller.abort(externalSignal?.reason ?? new Error(`${name} canceled.`));
		};
		externalSignal?.addEventListener("abort", cancel, { once: true });
		if (externalSignal?.aborted === true) {
			cancel();
		}
		const owner: ActiveCheckoutWork = { controller, promise: null };
		active.add(owner);
		const promise = (async (): Promise<T> => {
			try {
				controller.signal.throwIfAborted();
				return await work(controller.signal);
			} finally {
				externalSignal?.removeEventListener("abort", cancel);
				active.delete(owner);
			}
		})();
		owner.promise = promise;
		return promise;
	}

	/**
	 * Run checkout work for one request, cancelling it if the caller hangs up.
	 * @param request The request.
	 * @param response Its response.
	 * @param name What the work is.
	 * @param work The work.
	 * @returns The work's result.
	 */
	async function trackRequest<T>(
		request: CheckoutRequest,
		response: CheckoutResponse,
		name: string,
		work: CheckoutTask<T>,
	): Promise<T> {
		const requestController = new AbortController();
		/** Cancel the work because the caller has gone. */
		const cancel = (): void => {
			requestController.abort(new Error(`${request.method} ${request.path} disconnected.`));
		};
		request.once("aborted", cancel);
		response.once("close", cancel);
		try {
			return await track(name, requestController.signal, work);
		} finally {
			request.off("aborted", cancel);
			response.off("close", cancel);
		}
	}

	/** Stop admitting checkout work and cancel everything already running. */
	function quiesce(): void {
		accepting = false;
		for (const owner of active) {
			owner.controller.abort(new Error("Canvas checkout work stopped."));
		}
	}

	/**
	 * Quiesce, then wait for every admitted piece of work to settle, so
	 * shutdown never leaves checkout work running behind it.
	 */
	async function stop(): Promise<void> {
		quiesce();
		const admitted = [...active];
		const promises: Promise<unknown>[] = [];
		for (const owner of admitted) {
			if (owner.promise !== null) {
				promises.push(owner.promise);
			}
		}
		await Promise.allSettled(promises);
	}

	return {
		track,
		trackRequest,
		quiesce,
		/** Admit checkout work again, after a refused stop. */
		resume() {
			accepting = true;
		},
		stop,
	};
}

export { createCheckoutWorkOwner };
export type { CheckoutTask, CheckoutWorkOwner };
