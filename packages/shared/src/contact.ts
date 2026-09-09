import { z } from "zod";
import { plainText } from "./validation.js";

export const contactMessageSchema = z.object({
  name: plainText({ max: 200, minMessage: "Name is required" }),
  email: z.string().email("Must be a valid email address"),
  subject: plainText({ max: 200, minMessage: "Subject is required" }),
  message: plainText({ max: 3000, minMessage: "Message is required" }),
  turnstileToken: z.string().optional(),
});

export type ContactMessageDto = z.infer<typeof contactMessageSchema>;
