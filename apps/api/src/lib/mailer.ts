import { createTransport, type Transporter } from "nodemailer";
import { config } from "../config.js";

// Brevo's HTTPS transactional-email endpoint (works on any host that allows
// outbound 443 - unlike SMTP, which Railway blocks below the Pro plan).
const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

interface Message {
  to: string;
  subject: string;
  text: string;
}

function fromHeader(): string {
  return `${config.mailFromName} <${config.mailFromAddress}>`;
}

// The SMTP transporter is created lazily so importing this module doesn't
// open an SMTP connection until the first email is actually sent.
let transporter: Transporter | undefined;

async function sendViaSmtp(msg: Message): Promise<void> {
  transporter ??= createTransport(config.smtpUrl);
  await transporter.sendMail({
    from: fromHeader(),
    to: msg.to,
    subject: msg.subject,
    text: msg.text,
  });
}

/** Exported for focused testing. Throws on a non-2xx response from Brevo. */
export async function sendViaBrevoApi(msg: Message): Promise<void> {
  const res = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: {
      "api-key": config.brevoApiKey,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: { email: config.mailFromAddress, name: config.mailFromName },
      to: [{ email: msg.to }],
      subject: msg.subject,
      textContent: msg.text,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Brevo API ${res.status}: ${body.slice(0, 500)}`);
  }
}

async function sendEmail(msg: Message): Promise<void> {
  if (config.mailTransport === "brevo-api") {
    await sendViaBrevoApi(msg);
    return;
  }
  await sendViaSmtp(msg);
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  await sendEmail({
    to,
    subject: "Reset your eReader Dictionaries password",
    text: `We received a request to reset your eReader Dictionaries password.

If you made this request, follow this link within the next hour to choose a new password:
${resetUrl}

If you didn't request this, you can safely ignore this email — your password will not be changed.`,
  });
}

export async function sendVerificationEmail(to: string, verifyUrl: string): Promise<void> {
  await sendEmail({
    to,
    subject: "Verify your eReader Dictionaries email address",
    text: `Welcome to eReader Dictionaries!

Please confirm your email address by following this link within the next 24 hours:
${verifyUrl}

If you didn't create this account, you can safely ignore this email.`,
  });
}

export async function sendAccountApprovedEmail(to: string): Promise<void> {
  await sendEmail({
    to,
    subject: "Your eReader Dictionaries account has been approved",
    text: `Good news — your account has been approved by an administrator.

You can now log in and start creating and editing dictionary entries.`,
  });
}
