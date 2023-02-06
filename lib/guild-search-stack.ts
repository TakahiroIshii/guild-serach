import * as cdk from "aws-cdk-lib";
import { RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  NodejsFunction,
  NodejsFunctionProps,
} from "aws-cdk-lib/aws-lambda-nodejs";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import {
  AttributeType,
  BillingMode,
  StreamViewType,
  Table,
} from "aws-cdk-lib/aws-dynamodb";
import { keyMap, Keys, tableMap } from "../models/tableDecorator";
import { Guild } from "../models/guild";
import * as openSearch from "aws-cdk-lib/aws-opensearchserverless";
import { KinesisFirehoseStream } from "aws-cdk-lib/aws-events-targets";
import { Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { CfnDeliveryStream } from "aws-cdk-lib/aws-kinesisfirehose";

const tableName = tableMap.get(Guild)!;
const pk = keyMap.get(Guild)!.get(Keys.PK)!;
export class GuildSearchStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const functionProp: NodejsFunctionProps = {
      runtime: Runtime.NODEJS_14_X,
      memorySize: 1024,
    };

    const guildManageHandler = new NodejsFunction(this, "GuildManageHandler", {
      entry: "lambda/guildManageHandler.ts",
      ...functionProp,
    });

    const guildTable = new Table(this, "Friend", {
      tableName: tableName,
      partitionKey: {
        name: pk,
        type: AttributeType.STRING,
      },
      billingMode: BillingMode.PAY_PER_REQUEST,
      stream: StreamViewType.NEW_AND_OLD_IMAGES,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    guildTable.grantReadWriteData(guildManageHandler);

    const indexName = "guild-index";
    const collection = new openSearch.CfnCollection(this, "GuildSearch", {
      name: "guild-search",
      type: "SEARCH",
    });

    const encryptionPolicy = new openSearch.CfnSecurityPolicy(
      this,
      "GuildSearchSecurityPolicy",
      {
        name: "guild-search-policy",
        policy:
          '{"Rules":[{"ResourceType":"collection",' +
          `"Resource":["collection/${collection.name}"]}],"AWSOwnedKey":true}`,
        type: "encryption",
      }
    );
    collection.addDependency(encryptionPolicy);

    const networkPolicy = new openSearch.CfnSecurityPolicy(
      this,
      "GuildSearchNetworkPolicy",
      {
        name: "guild-search-network-policy",
        policy:
          `[{"Rules":[{"ResourceType":"collection",` +
          `"Resource":["collection/${collection.name}"]}, ` +
          `{"ResourceType":"dashboard",` +
          `"Resource":["collection/${collection.name}"]}],"AllowFromPublic":true}]`,
        type: "network",
      }
    );
    collection.addDependency(networkPolicy);

    const firehoseRole = new Role(this, "GuildFirehoseRole", {
      assumedBy: new ServicePrincipal("firehose.amazonaws.com"),
    });

    const accessPolicy = new openSearch.CfnAccessPolicy(
      this,
      "GuildSearchAccessPolicy",
      {
        name: "guild-search-access-policy",
        policy:
          `[{"Rules": [{"ResourceType": "index",` +
          `"Resource": ["index/${collection.name}/${indexName}"],` +
          `"Permission": ["aoss:WriteDocument","aoss:CreateIndex","aoss:UpdateIndex"]}],` +
          `"Principal": ["arn:aws:sts::${this.account}:assumed-role/${firehoseRole.roleName}/*"]}]`,
        type: "data",
      }
    );
    collection.addDependency(accessPolicy);

    new cdk.CfnOutput(this, "OpenSearchDashboardEndpoint", {
      value: collection.attrDashboardEndpoint,
    });

    const guildStreamBucket = new Bucket(this, "GuildStreamBucket", {});
    guildStreamBucket.grantWrite(firehoseRole);

    const guildStream = new KinesisFirehoseStream(
      new CfnDeliveryStream(this, "GuildStream", {
        deliveryStreamName: "guildStream",
        deliveryStreamType: "DirectPut",
        amazonOpenSearchServerlessDestinationConfiguration: {
          indexName: indexName,
          collectionEndpoint: collection.attrCollectionEndpoint,
          roleArn: firehoseRole.roleArn,
          retryOptions: {
            durationInSeconds: 10,
          },
          bufferingHints: {
            intervalInSeconds: 60,
          },
          s3Configuration: {
            bucketArn: guildStreamBucket.bucketArn,
            roleArn: firehoseRole.roleArn,
            bufferingHints: {
              intervalInSeconds: 60,
            },
          },
        },
      })
    );
  }
}
