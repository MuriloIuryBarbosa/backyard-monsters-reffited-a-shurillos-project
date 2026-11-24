import { MikroORM } from "@mikro-orm/postgresql";
import { ServerRole, User } from "../database/models/user.model.js";
import config from "../mikro-orm.config.js";

const [username, role] = Bun.argv.slice(2);
if (!username || (role !== ServerRole.PLAYER && role !== ServerRole.MODERATOR)) {
  console.error("Usage: bun run role:set <username> <player|moderator>");
  process.exit(1);
}

const orm = await MikroORM.init(config);
try {
  const updated = await orm.em.fork().nativeUpdate(User, { username, archived_at: null }, { server_role: role });
  if (updated !== 1) throw new Error("Active player not found.");
  console.log(`Server role for ${username}: ${role}`);
} finally {
  await orm.close();
}
