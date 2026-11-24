import bcrypt from "bcrypt";
import { raw } from "@mikro-orm/core";
import JWT, { type JwtPayload } from "jsonwebtoken";
import { Status } from "../../enums/StatusCodes.js";
import { SessionType } from "../../enums/SessionType.js";
import type { KoaController } from "../../utils/KoaController.js";
import { authFailureErr } from "../../errors/errors.js";
import { postgres, redis } from "../../server.js";
import { User } from "../../database/models/user.model.js";
import { ResetPasswordSchema } from "../../schemas/AuthSchemas.js";
import { sessionTokenKey } from "../../middleware/auth.js";
import { chatTokenKey } from "../../chat/chatChannels.js";

export const resetPassword: KoaController = async (ctx) => {
  const { password, token } = ResetPasswordSchema.parse(ctx.request.body);
  let claims: string | JwtPayload;
  try {
    claims = JWT.verify(token, process.env.SECRET_KEY!, { algorithms: ["HS256"] });
  } catch {
    throw authFailureErr();
  }

  if (typeof claims !== "object" || typeof claims.user?.email !== "string") throw authFailureErr();
  const email: string = claims.user.email;
  const user = await postgres.em.findOne(User, { email, resetToken: token }, { fields: ["userid"] });
  if (!user) throw authFailureErr();

  const hash = await bcrypt.hash(password, 10);
  const updated = await postgres.em.nativeUpdate(User, { userid: user.userid, resetToken: token }, {
    password: hash,
    resetToken: "",
    website_session_version: raw("website_session_version + 1"),
  });
  if (updated !== 1) throw authFailureErr();
  await Promise.all([
    redis.del(sessionTokenKey(SessionType.GAME, email, "")),
    redis.del(chatTokenKey(user.userid)),
  ]);

  ctx.status = Status.OK;
  ctx.body = { message: "Password has been reset successfully." };
};
