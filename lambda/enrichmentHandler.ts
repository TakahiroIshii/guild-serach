import * as AWS from "aws-sdk";
import { DocumentClient } from "aws-sdk/clients/dynamodb";
import { DynamoDBRecord } from "aws-lambda";
import { Guild } from "../models/guild";
import { playerTableName, playerTablePk } from "../models/player";
import { unmarshall } from "@aws-sdk/util-dynamodb";

const db = new AWS.DynamoDB.DocumentClient();
export const handler = async (event: DynamoDBRecord[]) => {
  const guilds = event.map(({ dynamodb }) => {
    return unmarshall(dynamodb!.NewImage!) as Guild;
  });

  const playerIds = guilds
    .map(({ members }) => {
      return members;
    })
    .flat()
    .map((playerId) => {
      return { [playerTablePk]: playerId };
    });
  const batchGetItemInput: DocumentClient.BatchGetItemInput = {
    RequestItems: { [playerTableName]: { Keys: playerIds } },
  };

  const { Responses } = await db.batchGet(batchGetItemInput).promise();

  const playerMap = new Map<string, string>();

  Responses![playerTableName].forEach(({ playerId, playerName }) => {
    playerMap.set(playerId, playerName);
  });

  return guilds.map((guild) => {
    const members = guild.members.map((member) => {
      return playerMap.get(member)!;
    });
    return { ...guild, members } as Guild;
  });
};
