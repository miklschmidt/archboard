import express from "express";
import { createServerHttpServer } from "@/server/archboard/lib/http-server";

/** The one Express application every canvas route and middleware mounts on. */
const app = express();

/** The HTTP server the application listens through; the lifetime owns its start and stop. */
const server = createServerHttpServer(app);

export { app, server };
