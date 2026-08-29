import { createTransport, type Transporter } from "nodemailer";

// Reading process.env and constructing the transporter is deferred to first
// use (not module top-level): in an ESM entry point, static imports are
// resolved and evaluated before the importing module's own top-level code
// runs, so a top-level `process.env` read here would run before
// index.ts's own `dotenv.config()` call takes effect.
let transporter: Transporter | undefined;

function getTransporter(): Transporter {
  transporter ??= createTransport(process.env["SMTP_URL"] ?? "smtp://localhost:1025");
  return transporter;
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  await getTransporter().sendMail({
    from: "eReader Dictionaries <no-reply@planetos.local>",
    to,
    subject: "Reset your eReader Dictionaries password",
    text: `We received a request to reset your eReader Dictionaries password.

If you made this request, follow this link within the next hour to choose a new password:
${resetUrl}

If you didn't request this, you can safely ignore this email — your password will not be changed.`,
  });
}
