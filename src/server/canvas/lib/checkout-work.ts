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

function createCheckoutWorkOwner(): CheckoutWorkOwner {
	let accepting = true;
	const active = new Set<ActiveCheckoutWork>();

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

	async function trackRequest<T>(
		request: CheckoutRequest,
		response: CheckoutResponse,
		name: string,
		work: CheckoutTask<T>,
	): Promise<T> {
		const requestController = new AbortController();
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

	function quiesce(): void {
		accepting = false;
		for (const owner of active) {
			owner.controller.abort(new Error("Canvas checkout work stopped."));
		}
	}

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
		resume() {
			accepting = true;
		},
		stop,
	};
}

export { createCheckoutWorkOwner };
export type { CheckoutTask, CheckoutWorkOwner };
