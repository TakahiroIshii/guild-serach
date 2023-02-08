import * as cdk from "aws-cdk-lib";
import * as openSearch from "aws-cdk-lib/aws-opensearchserverless";
import * as pipes from "aws-cdk-lib/aws-pipes";
import { Arn, ArnFormat, RemovalPolicy } from "aws-cdk-lib";
import {
  AttributeType,
  BillingMode,
  StreamViewType,
  Table,
} from "aws-cdk-lib/aws-dynamodb";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { CfnDeliveryStream } from "aws-cdk-lib/aws-kinesisfirehose";
import { Construct } from "constructs";
import {
  Effect,
  PolicyDocument,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { guildTableName, guildTablePk } from "../models/guild";
import { KinesisFirehoseStream } from "aws-cdk-lib/aws-events-targets";
import { LambdaRestApi } from "aws-cdk-lib/aws-apigateway";
import {
  NodejsFunction,
  NodejsFunctionProps,
} from "aws-cdk-lib/aws-lambda-nodejs";
import { playerTableName, playerTablePk } from "../models/player";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { SqsDlq } from "aws-cdk-lib/aws-lambda-event-sources";

export class GuildSearchStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const indexName = "guild-index";
    const collection = new openSearch.CfnCollection(this, "GuildSearch", {
      name: "guild-search",
      type: "SEARCH",
    });

    const functionProp: NodejsFunctionProps = {
      runtime: Runtime.NODEJS_16_X,
      memorySize: 1024,
    };

    const guildManageHandler = new NodejsFunction(this, "GuildManageHandler", {
      entry: "lambda/guildManageHandler.ts",
      environment: {
        OPEN_SEARCH_URL: collection.attrCollectionEndpoint,
        OPEN_SEARCH_INDEX: indexName,
      },
      ...functionProp,
    });

    const enrichmentHandler = new NodejsFunction(this, "EnrichmentHandler", {
      entry: "lambda/enrichmentHandler.ts",
      ...functionProp,
    });

    const guildTable = new Table(this, "Guild", {
      tableName: guildTableName,
      partitionKey: {
        name: guildTablePk,
        type: AttributeType.STRING,
      },
      billingMode: BillingMode.PAY_PER_REQUEST,
      stream: StreamViewType.NEW_AND_OLD_IMAGES,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    guildTable.grantReadWriteData(guildManageHandler);

    const playerTable = new Table(this, "Player", {
      tableName: playerTableName,
      partitionKey: {
        name: playerTablePk,
        type: AttributeType.STRING,
      },
      billingMode: BillingMode.PAY_PER_REQUEST,
    });

    playerTable.grantReadWriteData(guildManageHandler);
    playerTable.grantReadWriteData(enrichmentHandler);

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

    const searchPolicy = new openSearch.CfnAccessPolicy(
      this,
      "GuildSearchPolicy",
      {
        name: "guild-search-policy",
        policy:
          `[{"Rules": [{"ResourceType": "index",` +
          `"Resource": ["index/${collection.name}/${indexName}"],` +
          `"Permission": ["aoss:ReadDocument"]}],` +
          `"Principal": ["arn:aws:sts::${this.account}:assumed-role/${
            guildManageHandler.role!.roleName
          }/*"]}]`,
        type: "data",
      }
    );
    collection.addDependency(searchPolicy);

    new cdk.CfnOutput(this, "OpenSearchDashboardEndpoint", {
      value: collection.attrDashboardEndpoint,
    });

    const guildStreamBucket = new Bucket(this, "GuildStreamBucket", {});
    guildStreamBucket.grantWrite(firehoseRole);

    const guildStreamName = "guildStream";
    const guildStreamArn = Arn.format(
      {
        arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
        service: "firehose",
        resource: "deliverystream",
        resourceName: guildStreamName,
      },
      this
    );
    new KinesisFirehoseStream(
      new CfnDeliveryStream(this, "GuildStream", {
        deliveryStreamName: guildStreamName,
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

    const queue = new Queue(this, "GuildDlq");
    new SqsDlq(queue);
    const dlqArn = Arn.format(
      {
        arnFormat: ArnFormat.COLON_RESOURCE_NAME,
        service: "sqs",
        resource: queue.queueName,
      },
      this
    );

    const pipesRole = new Role(this, "GuildPipesRole", {
      assumedBy: new ServicePrincipal("pipes.amazonaws.com"),
      inlinePolicies: {
        dynamoDBStreamSourcePipePolicy: new PolicyDocument({
          statements: [
            new PolicyStatement({
              actions: [
                "dynamodb:DescribeStream",
                "dynamodb:GetRecords",
                "dynamodb:GetShardIterator",
                "dynamodb:ListStreams",
              ],
              resources: [guildTable.tableStreamArn!],
              effect: Effect.ALLOW,
            }),
          ],
        }),
        firehoseTargetPipePolicy: new PolicyDocument({
          statements: [
            new PolicyStatement({
              actions: ["firehose:PutRecordBatch"],
              resources: [guildStreamArn],
              effect: Effect.ALLOW,
            }),
          ],
        }),
        dlqPolicy: new PolicyDocument({
          statements: [
            new PolicyStatement({
              actions: [
                "sqs:SendMessage",
                "sqs:GetQueueAttributes",
                "sqs:GetQueueUrl",
              ],
              resources: [dlqArn],
              effect: Effect.ALLOW,
            }),
          ],
        }),
        enrichmentPolicy: new PolicyDocument({
          statements: [
            new PolicyStatement({
              actions: ["lambda:InvokeFunction"],
              resources: [enrichmentHandler.functionArn],
              effect: Effect.ALLOW,
            }),
          ],
        }),
      },
    });

    new pipes.CfnPipe(this, "GuildPipes", {
      roleArn: pipesRole.roleArn,
      source: guildTable.tableStreamArn!,
      target: guildStreamArn,

      name: "GuildPipe",
      sourceParameters: {
        dynamoDbStreamParameters: {
          startingPosition: "LATEST",
          batchSize: 5,
          maximumBatchingWindowInSeconds: 2,
          deadLetterConfig: {
            arn: dlqArn,
          },
          maximumRetryAttempts: 1,
        },
        filterCriteria: {
          filters: [
            {
              pattern: JSON.stringify({ eventName: ["INSERT"] }),
            },
          ],
        },
      },
      enrichment: enrichmentHandler.functionArn,
    });

    const guildManageAPI = new LambdaRestApi(this, "GuildManageAPI", {
      handler: guildManageHandler,
      proxy: false,
    });

    const manage = guildManageAPI.root.addResource("manage");
    manage.addMethod("POST");
    manage.addResource("description").addResource("{value}").addMethod("GET");
    manage.addResource("player").addResource("{value}").addMethod("GET");
  }
}
