// A panic aborts a wasm32 call without unwinding Rust's stack. The instance
// cannot be used again, and wasm-bindgen's future can leave its promise pending.
// The build installs this boundary in the glue shared by Bun, pages and workers.

/** A trapped core, including the action that gives its host a fresh instance. */
class CorePanicError extends WebAssembly.RuntimeError {
	readonly code = "CORE_PANIC";

	/**
	 * Keep the original trap for diagnosis.
	 * @param cause The trap that made the instance unusable.
	 */
	constructor(cause: WebAssembly.RuntimeError) {
		super(
			"CORE_PANIC: The renderer core trapped and cannot render again. " +
				"Reload the page or restart the rendering process.",
		);
		this.name = "CorePanicError";
		this.cause = cause;
	}
}

/** One instance's failure boundary, including callbacks that resume Rust futures. */
class CoreGuard {
	private failure: CorePanicError | undefined;
	private readonly pending = new Set<(error: CorePanicError) => void>();

	/**
	 * Enter WebAssembly only while this instance is usable.
	 * @param call The export to enter, with its arguments bound.
	 * @returns The export's answer.
	 * @throws {CorePanicError} When this instance traps or already trapped.
	 */
	private enter(call: () => unknown): unknown {
		if (this.failure !== undefined) throw this.failure;
		try {
			return call();
		} catch (cause) {
			if (!(cause instanceof WebAssembly.RuntimeError)) throw cause;
			this.failure ??= new CorePanicError(cause);
			for (const reject of this.pending) reject(this.failure);
			this.pending.clear();
			throw this.failure;
		}
	}

	/**
	 * Protect every entry, including allocation, closure invocation and destruction.
	 * @param exports The instance's raw exports.
	 * @returns The exports that the generated glue can call.
	 */
	exports(exports: WebAssembly.Exports): WebAssembly.Exports {
		return Object.fromEntries(
			Object.entries(exports).map(([name, value]) => [name, this.exported(value)]),
		);
	}

	/**
	 * Guard a callable export and keep memories, tables and globals intact.
	 * @param value One raw export.
	 * @returns The protected export.
	 */
	private exported(value: WebAssembly.ExportValue): WebAssembly.ExportValue {
		if (typeof value !== "function") return value;
		return new Proxy(value, {
			/**
			 * Call the raw function through the instance's failure boundary.
			 * @param target The raw function.
			 * @param receiver Its receiver.
			 * @param args Its arguments.
			 * @returns Its answer.
			 */
			apply: (target, receiver: unknown, args: unknown[]): unknown =>
				this.enter(() => Reflect.apply(target, receiver, args)),
		});
	}

	/**
	 * Detach callbacks after a trap. Pending renders already received the error,
	 * so neither a queued continuation nor a finalizer enters the damaged instance.
	 * @param callback A generated Rust closure or its finalizer.
	 * @returns The callback with the same closure bookkeeping properties.
	 */
	callback<T extends (...args: never[]) => unknown>(callback: T): T {
		return new Proxy(callback, {
			/**
			 * Resume a live closure, or discard one whose instance trapped.
			 * @param target The generated callback.
			 * @param receiver Its receiver.
			 * @param args Its arguments.
			 * @returns Its answer, or nothing after a trap.
			 */
			apply: (target, receiver: unknown, args: unknown[]): unknown => {
				if (this.failure !== undefined) return undefined;
				try {
					return Reflect.apply(target, receiver, args);
				} catch (error) {
					if (error !== this.failure) throw error;
					return undefined;
				}
			},
		});
	}

	/**
	 * Settle a render even when a trap strands wasm-bindgen's internal promise.
	 * @param draw The generated render call.
	 * @returns The picture or the instance's failure.
	 * @throws {CorePanicError} When this instance traps or already trapped.
	 */
	async render<T>(draw: () => Promise<T>): Promise<T> {
		if (this.failure !== undefined) throw this.failure;
		const failed = Promise.withResolvers<never>();
		this.pending.add(failed.reject);
		try {
			// Attach both handlers before entering the core: even allocation can trap.
			return await Promise.race([failed.promise, Promise.resolve().then(draw)]);
		} finally {
			this.pending.delete(failed.reject);
		}
	}
}

export { CoreGuard };
