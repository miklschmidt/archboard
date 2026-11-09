// The docs pages: one MDX file for each page under src/content/docs. The sidebar's order is
// src/lib/docs-nav.ts, so a page names only what it is about.
import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const docs = defineCollection({
	loader: glob({ pattern: "**/*.mdx", base: "./src/content/docs" }),
	schema: z.object({
		title: z.string(),
		description: z.string(),
	}),
});

export const collections = { docs };
