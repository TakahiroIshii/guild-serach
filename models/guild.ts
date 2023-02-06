import { Table, pk } from "./tableDecorator";

@Table("Guilds")
export class Guild {
  @pk
  guildId: string;
  guildName: string;
  guildStyle: string;
  members: string[];
}
