import { Migration } from "@mikro-orm/migrations";

export class ExpandPasswordResetToken extends Migration {
  async up(): Promise<void> {
    this.addSql(`ALTER TABLE bym."user" ALTER COLUMN reset_token TYPE text;`);
  }
}
