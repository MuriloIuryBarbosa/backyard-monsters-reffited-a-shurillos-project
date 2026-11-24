import JWT from "jsonwebtoken";
import { Status } from "../../enums/StatusCodes.js";
import type { KoaController } from "../../utils/KoaController.js";
import { logger } from "../../utils/logger.js";
import { postgres } from "../../server.js";
import { User } from "../../database/models/user.model.js";
import { ForgotPasswordSchema } from "../../schemas/AuthSchemas.js";
import { mailFrom, transporter } from "../../config/MailConfig.js";
import { publicServerUrl } from "../../config/publicServerUrl.js";

const template = Bun.file(new URL("../../../public/templates/forgot-password.html", import.meta.url));

export const forgotPassword: KoaController = async (ctx) => {
  const { email } = ForgotPasswordSchema.parse(ctx.request.body);
  const user = await postgres.em.findOne(User, { email });

  if (user) {
    const token = JWT.sign({ user: { email } }, process.env.SECRET_KEY!, {
      expiresIn: "20m",
      jwtid: crypto.randomUUID(),
    });
    user.resetToken = token;
    await postgres.em.flush();

    const serverUrl = publicServerUrl();
    const configuredWebsite = process.env.WEB_URL;
    const externalRecovery = ctx.path !== "/account/forgot-password" && configuredWebsite &&
      new URL(configuredWebsite).origin !== serverUrl;
    const resetLink = externalRecovery
      ? new URL("/reset-password", configuredWebsite)
      : new URL("/reset-password/", serverUrl);
    if (externalRecovery) resetLink.searchParams.set("token", token);
    else resetLink.hash = new URLSearchParams({ token }).toString();
    void template.text().then((html) => transporter.sendMail({
      from: mailFrom,
      to: email,
      subject: "Password reset request | BYM Refitted",
      text: `Reset your password using this link within 20 minutes: ${resetLink.href}`,
      html: html.replace("{{resetLink}}", Bun.escapeHTML(resetLink.href)),
    })).catch((error) => logger.error(`Password reset email failed for user ${user.userid}: ${error}`));
  }

  ctx.status = Status.OK;
  ctx.body = { message: "If the account exists, a password reset link will be sent." };
};
