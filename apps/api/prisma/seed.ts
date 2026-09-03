import "../src/load-env.js";
import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";
import { passwordSchema, normalizeWord } from "@planetos/shared";

// The sample value shipped in .env.example - never acceptable as a real
// administrator password.
const PLACEHOLDER_ADMIN_PASSWORDS = new Set(["ChangeMe1!"]);

const prisma = new PrismaClient();

async function main() {
  const email = process.env["ADMIN_EMAIL"];
  const password = process.env["ADMIN_PASSWORD"];

  if (!email || !password) {
    console.error("ADMIN_EMAIL and ADMIN_PASSWORD must be set in the environment.");
    process.exit(1);
  }

  if (PLACEHOLDER_ADMIN_PASSWORDS.has(password)) {
    console.error("ADMIN_PASSWORD is the .env.example placeholder - choose a real password.");
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
  const normalizedEmail = normalizeWord(email);
  const username = "Administrator";

  await prisma.user.upsert({
    where: { email: normalizedEmail },
    create: {
      email: normalizedEmail,
      username,
      usernameNormalized: normalizeWord(username),
      passwordHash,
      role: "ADMIN",
      isActive: true,
      approvalStatus: "APPROVED",
      emailVerified: true,
    },
    update: {
      passwordHash,
      role: "ADMIN",
      isActive: true,
      approvalStatus: "APPROVED",
      emailVerified: true,
    },
  });

  console.log(`Admin account upserted: ${normalizedEmail}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
