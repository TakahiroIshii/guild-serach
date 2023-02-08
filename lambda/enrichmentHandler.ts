import { DynamoDBRecord } from "aws-lambda";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { Guild } from "../models/guild";

export const handler = async (event: DynamoDBRecord[]) => {
  console.log("event", event);
  const result = event.map(({ dynamodb }) => {
    if (dynamodb == null) {
      return {};
    }
    return unmarshall(dynamodb.NewImage!) as Guild;
  });
  return result;
};
