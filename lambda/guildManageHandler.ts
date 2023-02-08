import * as AWS from "aws-sdk";
import { APIGatewayProxyHandler, APIGatewayProxyResult } from "aws-lambda";
import { DocumentClient } from "aws-sdk/clients/dynamodb";
import { guildTableName, guildTablepk } from "../models/guild";

const db = new AWS.DynamoDB.DocumentClient();

export const handler: APIGatewayProxyHandler =
  async (): Promise<APIGatewayProxyResult> => {
    const timeStamp = Date.now();
    const putParam: DocumentClient.PutItemInput = {
      TableName: guildTableName,
      Item: {
        [guildTablepk]: `guild + ${timeStamp / 1000}`,
        description: "compete with other guilds! play midnight",
        guildStyle: "hardcore",
        guildName: "cool guild",
        members: ["player1", "player2"],
      },
    };
    await db.put(putParam).promise();
    const putParam2: DocumentClient.PutItemInput = {
      TableName: guildTableName,
      Item: {
        [guildTablepk]: `guild22222 + ${timeStamp / 1000}`,
        description: "let's have fun! play together and enjoy this game!",
        guildStyle: "easygoing",
        guildName: "chill guild",
        members: ["player3", "player4"],
      },
    };
    await db.put(putParam2).promise();
    return {
      statusCode: 200,
      body: "Done",
    };
  };
