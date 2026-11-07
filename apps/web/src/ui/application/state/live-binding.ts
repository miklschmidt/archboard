// A value bound during render and read from callbacks: the way owners that
// exist only after a hook has run reach the callbacks that hook fires. A
// method rather than a ref because it is read from callbacks, never from
// render, and a read before the first binding is a programming error.

/** A value replaced each render and read later. */
class LiveBinding<T> {
	#current: T | null = null;

	/**
	 * Bind the current value.
	 * @param value The value.
	 */
	bind(value: T): void {
		this.#current = value;
	}

	/**
	 * The current value.
	 * @returns The value.
	 * @throws {Error} When nothing was bound; callbacks only fire after the first render.
	 */
	read(): T {
		if (this.#current === null) {
			throw new Error("A live binding is read after the first render binds it.");
		}
		return this.#current;
	}
}

export { LiveBinding };
