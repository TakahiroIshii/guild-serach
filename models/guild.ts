import { Table, pk, tableMap, keyMap, Keys } from "./tableDecorator";

@Table("Guilds")
export class Guild {
  @pk
  guildId: string;
  guildName: string;
  guildStyle: string;
  members: string[];
  description: string;
}

export const guildTableName = tableMap.get(Guild)!;
export const guildTablepk = keyMap.get(Guild)!.get(Keys.PK)!;
