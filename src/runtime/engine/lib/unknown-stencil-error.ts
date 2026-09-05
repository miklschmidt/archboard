/** A name or id no stencil has. */
class UnknownStencilError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = "UnknownStencilError";
	}
}

export { UnknownStencilError };
