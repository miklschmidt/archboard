/** A name or id no stencil has. */
class UnknownStencilError extends Error {
	/**
	 * A refusal naming the stencil that was asked for.
	 * @param message What was asked for, and what the library holds.
	 */
	public constructor(message: string) {
		super(message);
		this.name = "UnknownStencilError";
	}
}

export { UnknownStencilError };
