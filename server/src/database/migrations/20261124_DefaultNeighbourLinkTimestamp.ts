import { Migration } from "@mikro-orm/migrations";

export class DefaultNeighbourLinkTimestamp extends Migration {
  async up(): Promise<void> {
    this.addSql("ALTER TABLE bym.neighbour_link ALTER COLUMN created_at SET DEFAULT now();");
  }
}
