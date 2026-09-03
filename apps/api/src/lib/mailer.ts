import { createTransport, type Transporter } from "nodemailer";
import { config } from "../config.js";

// The transporter is created lazily so importing this module doesn't open
// an SMTP connection until the first email is actually sent.
let transporter: Transporter | undefined;

function getTransporter(): Transporter {
  transporter ??= createTransport(config.smtpUrl);
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

export async function sendVerificationEmail(to: string, verifyUrl: string): Promise<void> {
  await getTransporter().sendMail({
    from: "eReader Dictionaries <no-reply@planetos.local>",
    to,
    subject: "Verify your eReader Dictionaries email address",
    text: `Welcome to eReader Dictionaries!

Please confirm your email address by following this link within the next 24 hours:
${verifyUrl}

If you didn't create this account, you can safely ignore this email.`,
  });
}

export async function sendAccountApprovedEmail(to: string): Promise<void> {
  await getTransporter().sendMail({
    from: "eReader Dictionaries <no-reply@planetos.local>",
    to,
    subject: "Your eReader Dictionaries account has been approved",
    text: `Good news — your account has been approved by an administrator.

You can now log in and start creating and editing dictionary entries.`,
  });
}
