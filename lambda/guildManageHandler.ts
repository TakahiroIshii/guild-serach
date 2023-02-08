import * as AWS from "aws-sdk";
import {
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
} from "aws-lambda";
import { DocumentClient } from "aws-sdk/clients/dynamodb";
import { guildTableName, guildTablepk } from "../models/guild";
const { Client } = require("@opensearch-project/opensearch");
const { AwsSigv4Signer } = require("@opensearch-project/opensearch/aws");

const db = new AWS.DynamoDB.DocumentClient();
const osClient = new Client({
  ...AwsSigv4Signer({
    region: process.env.AWS_REGION,
    service: "aoss",
    getCredentials: () =>
      new Promise((resolve, reject) => {
        // Any other method to acquire a new Credentials object can be used.
        AWS.config.getCredentials((err, credentials) => {
          if (err) {
            reject(err);
          } else {
            resolve(credentials);
          }
        });
      }),
  }),
  node: process.env.OPEN_SEARCH_URL,
});

export const handler: APIGatewayProxyHandler = async ({
  httpMethod,
  pathParameters,
}: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const timeStamp = Date.now();
  if (httpMethod == "POST") {
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
  }
  const description = pathParameters!["description"];
  const query = {
    query: {
      match: {
        description: {
          query: description,
        },
      },
    },
  };

  const response = await osClient.search({
    index: process.env.OPEN_SEARCH_INDEX,
    body: query,
  });
  return {
    statusCode: 200,
    body: JSON.stringify(response.body.hits),
  };
};
