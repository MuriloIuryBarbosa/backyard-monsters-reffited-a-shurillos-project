import bcrypt from "bcrypt";
import type { KoaController } from "../../utils/KoaController.js";
import { postgres } from "../../server.js";
import { User } from "../../database/models/user.model.js";
import { FilterFrontendKeys } from "../../utils/FrontendKey.js";
import { emailUniqueErr, usernameUniqueErr } from "../../errors/errors.js";
import { logger } from "../../utils/logger.js";
import { Status } from "../../enums/StatusCodes.js";
import { UserRegistrationSchema } from "../../schemas/AuthSchemas.js";
import { BYMR_CDN } from "../../services/discord/fetchDiscordAvatar.js";
import type { GameLanguage } from "../../config/GameLanguages.js";
import type z from "zod";

/**
 * Controller to handle user registration.
 *
 * This controller registers a new user based on the provided input. It hashes the user's
 * password, saves the user to the database, and returns the filtered user information.
 * If registration fails, it throws an authentication failure error.
 *
 * @param {Context} ctx - The Koa context object.
 * @returns {Promise<void>} - A promise that resolves when the controller is complete.
 * @throws {Error} - Throws an error if registration fails or if the request body is invalid.
 */
export const register: KoaController = async (ctx) => {
  const user = await registerUser(UserRegistrationSchema.parse(ctx.request.body), ctx.ip);
  ctx.status = Status.OK;
  ctx.body = { user: FilterFrontendKeys(user) };
};

export const registerUser = async (registeredUser: z.output<typeof UserRegistrationSchema>, ip: string, gameLanguage?: GameLanguage) => {
  // Find user by username or email
  const existingUser = await postgres.em.findOne(User, {
    $or: [
      { username: registeredUser.username },
      { email: registeredUser.email },
    ],
  });

  // If user exists, check if username or email is already taken
  if (existingUser) {
    const isUsernameTaken = existingUser.username === registeredUser.username;
    const isEmailTaken = existingUser.email === registeredUser.email;

    if (isUsernameTaken) throw usernameUniqueErr();
    if (isEmailTaken) throw emailUniqueErr();
  }

  const hash = await bcrypt.hash(registeredUser.password!, 10);

  // Create new user record
  const user = postgres.em.create(User, {
    username: registeredUser.username,
    email: registeredUser.email,
    ...(gameLanguage && { game_language: gameLanguage }),
    pic_square: `${BYMR_CDN}/assets/bym-refitted-assets/placeholder.jpg`,
    password: hash,
  });

  postgres.em.persist(user);
  await postgres.em.flush();
  logger.info(
    `User ${user.username} registered successfully | ID: ${user.userid} | Email: ${user.email} | IP Address: ${ip}`
  );

  return user;
};
