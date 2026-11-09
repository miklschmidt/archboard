// Each JSON Schema as a file, for an editor or a validator: /docs/reference/schemas/<name>.json.
import type { APIRoute } from "astro";
import { reference } from "../../../../lib/reference";

export function getStaticPaths() {
	return reference.schemas.map((entry) => ({ params: { name: entry.name } }));
}

export const GET: APIRoute = ({ params }) => {
	const entry = reference.schemas.find((schema) => schema.name === params["name"]);
	return new Response(`${JSON.stringify(entry?.schema ?? {}, null, "\t")}\n`, {
		headers: { "Content-Type": "application/schema+json" },
	});
};
