import Router from "@koa/router";
import { LockMode, type FilterQuery } from "@mikro-orm/core";
import type { Context, Next } from "koa";
import z from "zod";
import { clients } from "./chat/chatState.js";
import { gameLoginResponse, issueSessionToken, login } from "./controllers/auth/login.js";
import { logout } from "./controllers/auth/logout.js";
import { registerUser } from "./controllers/auth/register.js";
import { requireDiscord } from "./config/AccountPolicy.js";
import { GAME_LANGUAGES } from "./config/GameLanguages.js";
import { getFriends } from "./controllers/friends/getFriends.js";
import { removeFriend } from "./controllers/friends/removeFriend.js";
import { respondFriendRequest } from "./controllers/friends/respondFriendRequest.js";
import { sendFriendRequest } from "./controllers/friends/sendFriendRequest.js";
import { Save } from "./database/models/save.model.js";
import { ServerRole, User } from "./database/models/user.model.js";
import { BaseType } from "./enums/Base.js";
import { Env } from "./enums/Env.js";
import { SessionType } from "./enums/SessionType.js";
import { Status } from "./enums/StatusCodes.js";
import { authenticateSession, verifyAccountStatus } from "./middleware/auth.js";
import { ClientSafeError } from "./middleware/clientSafeError.js";
import { friendRequestLimiter, loginLimiter, registerLimiter, searchPlayersLimiter } from "./middleware/rateLimiters.js";
import { UserLoginSchema, UserRegistrationSchema } from "./schemas/AuthSchemas.js";
import { SearchPlayersSchema } from "./schemas/FriendSchemas.js";
import { postgres } from "./server.js";
import { searchPlayers } from "./services/friends/friendList.js";
import { logger } from "./utils/logger.js";

const website = new Router({ prefix: "/account" });
const SESSION_COOKIE = "bymr_website";
const PAGE_SIZE = 25;
const MAX_CREDITS = 2147483647;

const credentials = UserLoginSchema.pick({ email: true, password: true }).required();
const preferences = z.strictObject({ language: z.enum(GAME_LANGUAGES) });
const registration = UserRegistrationSchema.extend(preferences.shape);
const playerId = z.coerce.number().int().positive().max(MAX_CREDITS);
const adjustShiny = z.strictObject({
  delta: z.number().int().min(-MAX_CREDITS).max(MAX_CREDITS).refine((value) => value !== 0),
  operationId: z.uuid(),
});
const playersQuery = z.object({
  search: z.string().trim().max(40).default(""),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  status: z.enum(["active", "archived"]).default("active"),
});

function fail(status: Status, message: string): never {
  throw new ClientSafeError({ status, message, data: {} });
}

const cookieOptions = (ctx: Context) => ({
  path: "/account",
  httpOnly: true,
  sameSite: "strict" as const,
  secure: ctx.secure,
  signed: false,
});

const identity = (user: User) => ({
  id: user.userid,
  username: user.username,
  role: user.server_role,
  language: user.game_language,
});

const websiteAuth = async (ctx: Context, next: Next) => {
  const token = ctx.cookies.get(SESSION_COOKIE, { signed: false });
  if (!token) fail(Status.UNAUTHORIZED, "Entre na sua conta para continuar.");
  await authenticateSession(ctx, token);
  if (ctx.sessionType !== SessionType.WEBSITE) fail(Status.UNAUTHORIZED, "Sessão inválida.");
  await next();
};

const moderatorOnly = async (ctx: Context, next: Next) => {
  if (ctx.authUser.server_role !== ServerRole.MODERATOR) {
    fail(Status.FORBIDDEN, "Esta função é exclusiva da moderação.");
  }
  await next();
};

const sameOrigin = async (ctx: Context, next: Next) => {
  if (ctx.get("Origin") !== ctx.URL.origin) fail(Status.FORBIDDEN, "Origem da solicitação inválida.");
  await next();
};

website.use(async (ctx, next) => {
  ctx.set("Cache-Control", "no-store");
  try {
    await next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      ctx.status = Status.BAD_REQUEST;
      ctx.body = { error: "Confira os dados da solicitação." };
      return;
    }
    if (!(error instanceof ClientSafeError)) {
      logger.error("Website request failed on {method} {path}: {error}", { method: ctx.method, path: ctx.path, error });
    }
    const status = error instanceof ClientSafeError ? error.status : Status.INTERNAL_SERVER_ERROR;
    ctx.status = status;
    ctx.body = {
      error: status === Status.UNAUTHORIZED ? "Sessão encerrada. Entre novamente."
        : error instanceof ClientSafeError ? error.message
        : "Não foi possível concluir a operação.",
    };
  }
});

website.post("/login", sameOrigin, loginLimiter, async (ctx) => {
  const input = credentials.safeParse(ctx.request.body);
  if (!input.success) fail(Status.BAD_REQUEST, "Informe o e-mail e a senha da sua conta.");
  ctx.request.body = { ...input.data, sessionType: SessionType.WEBSITE };
  try {
    await login(ctx);
  } catch (error) {
    if (error instanceof ClientSafeError && error.status < 500) {
      fail(Status.FORBIDDEN, "Confira o e-mail, a senha e o acesso da sua conta.");
    }
    throw error;
  }
  const { token, userId } = ctx.body as { token: string; userId: number };
  const user = await postgres.em.findOneOrFail(User, userId);
  ctx.cookies.set(SESSION_COOKIE, token, cookieOptions(ctx));
  ctx.body = { user: identity(user) };
});

website.post("/register", sameOrigin, registerLimiter, async (ctx) => {
  const input = registration.safeParse(ctx.request.body);
  if (!input.success) fail(Status.BAD_REQUEST, "Confira o nome, o e-mail, a senha e o idioma.");
  const user = await registerUser(input.data, ctx.ip, input.data.language);
  ctx.status = Status.CREATED;
  if (process.env.ENV === Env.PROD && requireDiscord) {
    ctx.body = { verificationRequired: true };
    return;
  }
  const token = await issueSessionToken(user, SessionType.WEBSITE);
  ctx.cookies.set(SESSION_COOKIE, token, cookieOptions(ctx));
  ctx.body = { user: identity(user) };
});

website.get("/session", websiteAuth, async (ctx) => {
  ctx.body = { user: identity(ctx.authUser) };
});

website.patch("/preferences", sameOrigin, websiteAuth, async (ctx) => {
  const { language } = preferences.parse(ctx.request.body);
  ctx.authUser.game_language = language;
  await postgres.em.flush();
  ctx.body = { user: identity(ctx.authUser) };
});

website.post("/game", sameOrigin, websiteAuth, async (ctx) => {
  const user = ctx.authUser;
  if (process.env.ENV === Env.PROD && requireDiscord && !user.discord_verified) {
    fail(Status.FORBIDDEN, "Verifique sua conta no Discord para jogar.");
  }
  const token = await issueSessionToken(user, SessionType.GAME, undefined, ctx.sessionId);
  ctx.body = {
    player: gameLoginResponse(user, token),
    language: user.game_language.toLowerCase(),
  };
});

website.post("/logout", sameOrigin, websiteAuth, async (ctx) => {
  await logout(ctx);
  ctx.cookies.set(SESSION_COOKIE, null, cookieOptions(ctx));
  ctx.status = Status.NO_CONTENT;
});

website.get("/friends", websiteAuth, getFriends);
website.get("/friends/search", websiteAuth, searchPlayersLimiter, async (ctx) => {
  const input = SearchPlayersSchema.safeParse(ctx.query);
  if (!input.success) fail(Status.BAD_REQUEST, "Digite de 2 a 30 caracteres do nome do jogador.");
  const players = await searchPlayers(ctx.authUser, input.data.search, { includeWithoutYard: true });
  ctx.body = { players };
});
website.post("/friends/request", sameOrigin, websiteAuth, verifyAccountStatus, friendRequestLimiter, sendFriendRequest);
website.post("/friends/respond", sameOrigin, websiteAuth, respondFriendRequest);
website.post("/friends/remove", sameOrigin, websiteAuth, removeFriend);

website.get("/players", websiteAuth, moderatorOnly, async (ctx) => {
  const input = playersQuery.safeParse(ctx.query);
  if (!input.success) fail(Status.BAD_REQUEST, "Filtro ou página inválida.");
  const { search, page, status } = input.data;
  const where: FilterQuery<User> = { archived_at: status === "archived" ? { $ne: null } : null };
  if (search) where.username = { $ilike: "%" + search.replace(/[\\%_]/g, "\\$&") + "%" };

  const [players, total] = await postgres.em.findAndCount(User, where, {
    fields: ["userid", "username", "server_role", "banned", "shiny_locked", "archived_at", "save.credits"],
    populate: ["save"],
    orderBy: { userid: "ASC" },
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  ctx.body = {
    players: players.map((player) => ({
      id: player.userid,
      username: player.username,
      role: player.server_role,
      banned: player.banned,
      shinyLocked: player.shiny_locked,
      credits: player.save?.credits ?? null,
    })),
    total, page, pageSize: PAGE_SIZE,
  };
});

website.patch("/players/:id/shiny", sameOrigin, websiteAuth, moderatorOnly, async (ctx) => {
  const id = playerId.safeParse(ctx.params.id);
  const input = adjustShiny.safeParse(ctx.request.body);
  if (!id.success || !input.success) fail(Status.BAD_REQUEST, "Informe uma quantidade inteira e válida de Shiny.");
  const actor = ctx.authUser.userid;
  const { delta, operationId } = input.data;
  ctx.body = await postgres.em.transactional(async (em) => {
    const player = await em.findOne(User, { userid: id.data }, { lockMode: LockMode.PESSIMISTIC_WRITE });
    if (!player || player.archived_at) fail(Status.NOT_FOUND, "Jogador não encontrado.");
    const key = [actor, player.userid, operationId];
    const [previous] = await em.execute<{ delta: number; balance: number }[]>(
      "SELECT delta, balance FROM bym.shiny_adjustment WHERE actor_id = ? AND player_id = ? AND operation_id = ?", key,
    );
    if (previous) {
      if (previous.delta !== delta) fail(Status.CONFLICT, "Esta operação já foi usada com outra quantidade.");
      return { credits: previous.balance };
    }
    if (!player.save) fail(Status.CONFLICT, "O jogador precisa criar o quintal antes de receber Shiny.");
    const save = await em.findOne(Save, {
      basesaveid: player.save.basesaveid, saveuserid: player.userid, type: BaseType.MAIN,
    }, { lockMode: LockMode.PESSIMISTIC_WRITE });
    if (!save) fail(Status.CONFLICT, "Quintal principal indisponível.");
    const balance = save.credits + delta;
    if (balance < 0 || balance > MAX_CREDITS) fail(Status.CONFLICT, "O ajuste ultrapassa o limite do saldo.");
    save.credits = balance;
    await em.execute(
      "INSERT INTO bym.shiny_adjustment (actor_id, player_id, operation_id, delta, balance) VALUES (?, ?, ?, ?, ?)",
      [...key, delta, balance], "run",
    );
    return { credits: balance };
  });
});

async function changeArchivedState(ctx: Context, archived: boolean) {
  const id = playerId.safeParse(ctx.params.id);
  if (!id.success) fail(Status.BAD_REQUEST, "Jogador inválido.");
  const changed = await postgres.em.transactional(async (em) => {
    const player = await em.findOne(User, { userid: id.data }, { lockMode: LockMode.PESSIMISTIC_WRITE });
    if (!player) fail(Status.NOT_FOUND, "Jogador não encontrado.");
    if (player.server_role === ServerRole.MODERATOR) fail(Status.FORBIDDEN, "Contas de moderação são protegidas.");
    if (Boolean(player.archived_at) === archived) return false;
    player.archived_at = archived ? new Date() : null;
    if (archived) player.website_session_version++;
    return true;
  });
  if (archived) clients.get(id.data)?.ws.close();
  if (changed) {
    logger.info("Player archive status changed by {actorId} for {playerId}: {archived}", {
      actorId: ctx.authUser.userid, playerId: id.data, archived,
    });
  }
  ctx.status = Status.NO_CONTENT;
}

website.delete("/players/:id", sameOrigin, websiteAuth, moderatorOnly, (ctx) => changeArchivedState(ctx, true));
website.post("/players/:id/restore", sameOrigin, websiteAuth, moderatorOnly, (ctx) => changeArchivedState(ctx, false));

export default website;
