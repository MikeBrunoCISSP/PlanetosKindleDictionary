import { defineConfig } from "prisma/config";
import { config } from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

config({ path: join(dirname(fileURLToPath(import.meta.url)), "prisma/.env") });

export default defineConfig({
  earlyAccess: true,
  schema: "prisma/schema.prisma",
});
