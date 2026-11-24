import { Migration } from "@mikro-orm/migrations";

export class AddGameLanguage extends Migration {
  async up(): Promise<void> {
    this.addSql(`ALTER TABLE bym."user" ADD COLUMN IF NOT EXISTS game_language varchar(255) NOT NULL DEFAULT 'Portuguese';`);
  }

  async down(): Promise<void> {
    this.addSql(`ALTER TABLE bym."user" DROP COLUMN IF EXISTS game_language;`);
  }
}
