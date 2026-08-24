import { config } from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";
import { passwordSchema } from "@planetos/shared";

// Load .env from repo root when running directly (apps/api is 2 levels down)
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "../../../.env") });

const prisma = new PrismaClient();

async function main() {
  const email = process.env["ADMIN_EMAIL"];
  const password = process.env["ADMIN_PASSWORD"];

  if (!email || !password) {
    console.error("ADMIN_EMAIL and ADMIN_PASSWORD must be set in the environment.");
    process.exit(1);
  }

  const result = passwordSchema.safeParse(password);
  if (!result.success) {
    console.error("ADMIN_PASSWORD does not meet complexity requirements:");
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.message}`);
    }
    process.exit(1);
  }

  const passwordHash = await hash(password);

  await prisma.user.upsert({
    where: { email },
    create: {
      email,
      displayName: "Administrator",
      passwordHash,
      role: "ADMIN",
      isActive: true,
    },
    update: {
      passwordHash,
      role: "ADMIN",
      isActive: true,
    },
  });

  console.log(`Admin account upserted: ${email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
