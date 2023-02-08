import { keyMap, Keys, pk, Table, tableMap } from "./tableDecorator";

@Table("Players")
export class Player {
  @pk
  playerId: string;
  playerName: string;
}

export const playerTableName = tableMap.get(Player)!;
export const playerTablePk = keyMap.get(Player)!.get(Keys.PK)!;
