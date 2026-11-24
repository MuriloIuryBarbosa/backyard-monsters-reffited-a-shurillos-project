import nodemailer from "nodemailer";
import { Env } from "../enums/Env.js";

const smtpPort = Number(process.env.SMTP_PORT || 465);
const secure = !process.env.SMTP_SECURE
  ? smtpPort === 465
  : process.env.SMTP_SECURE === "true";

export const mailFrom = process.env.SMTP_FROM || "Backyard Monsters Refitted <info@bymrefitted.com>";

/** SMTP transporter configuration */
export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST!,
  port: smtpPort,
  auth: process.env.SMTP_USER ? {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD || "",
  } : undefined,
  secure,
  requireTLS: !secure && process.env.ENV === Env.PROD && process.env.SMTP_REQUIRE_TLS !== "false",
  connectionTimeout: 10000,
  disableFileAccess: true,
  disableUrlAccess: true,
  maxRecipients: 1,
});
