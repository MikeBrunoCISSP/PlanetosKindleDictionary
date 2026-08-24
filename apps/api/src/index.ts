import { config } from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
config({ path: join(dirname(fileURLToPath(import.meta.url)), "../../../.env") });
import Fastify from "fastify";
import { PrismaClient } from "@prisma/client";
import sessionPlugin from "./plugins/session.js";
import rateLimitPlugin from "./plugins/rateLimit.js";
import errorHandlerPlugin from "./plugins/errorHandler.js";
import authRoutes from "./routes/auth.js";
import adminRoutes from "./routes/admin.js";
import seriesRoutes from "./routes/series.js";

const prisma = new PrismaClient();
const app = Fastify({ logger: true });

await app.register(sessionPlugin);
await app.register(rateLimitPlugin);
await app.register(errorHandlerPlugin);

await app.register(authRoutes, { prisma });
await app.register(adminRoutes, { prisma });
await app.register(seriesRoutes, { prisma });

app.get("/health", async () => ({ status: "ok" }));

const port = Number(process.env["PORT"] ?? 3000);
await app.listen({ port, host: "0.0.0.0" });
