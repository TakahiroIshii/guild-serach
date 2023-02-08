import * as AWS from "aws-sdk";
import {
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
} from "aws-lambda";
import { DocumentClient } from "aws-sdk/clients/dynamodb";
import { guildTableName, guildTablePk } from "../models/guild";
import { playerTableName, playerTablePk } from "../models/player";

const { Client } = require("@opensearch-project/opensearch");
const { AwsSigv4Signer } = require("@opensearch-project/opensearch/aws");

const db = new AWS.DynamoDB.DocumentClient();

const osClient = new Client({
  ...AwsSigv4Signer({
    region: process.env.AWS_REGION,
    service: "aoss",
    getCredentials: () =>
      new Promise((resolve, reject) => {
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
  path,
  pathParameters,
}: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (httpMethod == "POST") {
    return await putSampleData();
  }

  const query = {
    query: {
      match: {},
    },
  };

  if (path.includes("description")) {
    const description = pathParameters!["value"];
    query.query.match = {
      description: {
        query: description,
      },
    };
  }

  if (path.includes("player")) {
    const playerName = pathParameters!["value"];
    query.query.match = {
      members: {
        query: playerName,
      },
    };
  }

  const response = await osClient.search({
    index: process.env.OPEN_SEARCH_INDEX,
    body: query,
  });
  return {
    statusCode: 200,
    body: JSON.stringify(response.body.hits),
  };
};

async function putSampleData() {
  const playerBatchWriteInput: DocumentClient.BatchWriteItemInput = {
    RequestItems: {
      [playerTableName]: [
        {
          PutRequest: {
            Item: {
              [playerTablePk]: `p1`,
              playerName: "Black Mage",
            },
          },
        },
        {
          PutRequest: {
            Item: {
              [playerTablePk]: `p2`,
              playerName: "White Mage",
            },
          },
        },
        {
          PutRequest: {
            Item: {
              [playerTablePk]: `p3`,
              playerName: "Blue Mage",
            },
          },
        },
        {
          PutRequest: {
            Item: {
              [playerTablePk]: `p4`,
              playerName: "Orange Mage",
            },
          },
        },
      ],
    },
  };
  await db.batchWrite(playerBatchWriteInput).promise();
  const guildBatchWriteInput: DocumentClient.BatchWriteItemInput = {
    RequestItems: {
      [guildTableName]: [
        {
          PutRequest: {
            Item: {
              [guildTablePk]: `guild1`,
              description: "compete with other guilds! play midnight",
              guildStyle: "hardcore",
              guildName: "cool guild",
              members: ["p1", "p2"],
            },
          },
        },
        {
          PutRequest: {
            Item: {
              [guildTablePk]: `guild2`,
              description: "let's have fun! play together and enjoy this game!",
              guildStyle: "easygoing",
              guildName: "chill guild",
              members: ["p3", "p4"],
            },
          },
        },
      ],
    },
  };
  await db.batchWrite(guildBatchWriteInput).promise();
  return {
    statusCode: 200,
    body: "Done",
  };
}
