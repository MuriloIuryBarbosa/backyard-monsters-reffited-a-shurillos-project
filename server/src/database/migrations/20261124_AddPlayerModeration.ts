import { Migration } from "@mikro-orm/migrations";

export class AddPlayerModeration extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE bym."user"
        ADD COLUMN IF NOT EXISTS server_role text NOT NULL DEFAULT 'player' CHECK (server_role IN ('player', 'moderator')),
        ADD COLUMN IF NOT EXISTS website_session_version integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS archived_at timestamptz;
    `);

    this.addSql(`
      CREATE TABLE IF NOT EXISTS bym.shiny_adjustment (
        actor_id integer NOT NULL,
        player_id integer NOT NULL,
        operation_id uuid NOT NULL,
        delta integer NOT NULL CHECK (delta <> 0),
        balance integer NOT NULL CHECK (balance >= 0),
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (actor_id, player_id, operation_id)
      );
    `);
  }
}
