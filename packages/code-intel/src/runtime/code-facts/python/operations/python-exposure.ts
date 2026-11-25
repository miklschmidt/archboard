// What a Python module is (ADR 0044, ADR 0046): a package, whose
// `__init__.py`, else its stub, says what it exposes and stands for its
// directory.

import type { ExposureRule } from "#runtime/code-facts/modules/operations/module-exposure.ts";

/** A Python file or stub. */
const PYTHON_FILE = /\.pyi?$/u;
/** The file of a Python package, which stands for its directory. */
const PACKAGE_FILE = /^__init__\.pyi?$/u;

/** Python's rule: a package, whose `__init__.py` says what it exposes. */
const PYTHON: ExposureRule = {
	/**
	 * Whether a file is Python or a Python stub.
	 * @param file The file.
	 * @returns True when it is.
	 */
	writes: (file) => PYTHON_FILE.test(file),
	/**
	 * Whether a file is a package's `__init__.py`.
	 * @param name The file's name.
	 * @returns True when it is.
	 */
	entry: (name) => PACKAGE_FILE.test(name),
	/**
	 * The package's `__init__.py`, else its stub; an import of the package
	 * reads the first of the two, as the resolver does.
	 * @param _pass The pass.
	 * @param checkout The checkout.
	 * @param directory The package's directory.
	 * @returns The file, or none for a directory that is no package.
	 */
	rootFiles: (_pass, checkout, directory) => {
		const files = ["__init__.py", "__init__.pyi"].map((name) =>
			directory === "" ? name : `${directory}/${name}`,
		);
		return Promise.resolve(files.filter((file) => checkout.files.has(file)).slice(0, 1));
	},
};

export { PYTHON, PYTHON_FILE };
