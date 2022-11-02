import path from "path";
import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as targets from "aws-cdk-lib/aws-route53-targets";

export interface DiscordProps extends cdk.StackProps {
  readonly domain: [string, string] | string;
}

export class FaucetStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props: DiscordProps) {
    const { domain, ...rest } = props;
    super(scope, id, rest);

    const staticAssets = new s3.Bucket(this, "imageBucket", {
      transferAcceleration: true,
    });
    new s3deploy.BucketDeployment(this, "static-assets-deployment-3", {
      sources: [
        s3deploy.Source.asset(path.join(__dirname, "../.build/assets")),
      ],
      destinationBucket: staticAssets,
    });

    const drinkerTable = new dynamodb.Table(this, "Drinker", {
      partitionKey: { name: "key", type: dynamodb.AttributeType.STRING },
      timeToLiveAttribute: "ttl",
      tableClass: dynamodb.TableClass.STANDARD,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    // Create a new SSM Parameter holding the table name, because we can
    // not pass env vars into edge lambdas
    const param = new ssm.StringParameter(this, "DrinkerTableName", {
      description: "The drinker table for the sepolia faucet",
      parameterName: "Sepolia_DrinkerTableName",
      stringValue: drinkerTable.tableName,
    });

    // Domain
    const domains = domain instanceof Array ? domain : [domain];
    const domainName = domains.join(".");
    const hostedZone = route53.HostedZone.fromLookup(this, "HostedZone", {
      domainName: domains.length === 2 ? domains[1] : domains[0],
    });

    const certificate = new acm.DnsValidatedCertificate(this, "certificate", {
      domainName,
      hostedZone,
      region: props.env?.region,
    });

    const apiHandler = new lambda.Function(this, "apiHandler", {
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "../.build/api-lambda")),
      memorySize: 512,
      timeout: cdk.Duration.seconds(10),
    });
    drinkerTable.grantReadWriteData(apiHandler);
    param.grantRead(apiHandler);

    const defaultHandler = new lambda.Function(this, "defaultHandler", {
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(
        path.join(__dirname, "../.build/default-lambda")
      ),
      memorySize: 512,
      timeout: cdk.Duration.seconds(10),
    });

    // const imageHandler = new lambda.Function(this, "imageHandler", {
    //   runtime: lambda.Runtime.NODEJS_16_X,
    //   handler: "index.handler",
    //   code: lambda.Code.fromAsset(
    //     path.join(__dirname, "../.build/image-lambda")
    //   ),
    //   memorySize: 512,
    //   timeout: cdk.Duration.seconds(10),
    // });
    // staticAssets.grantReadWrite(imageHandler);
    const defaultCachePolicy = new cloudfront.CachePolicy(
      this,
      "defaultCachePolicy",
      {
        defaultTtl: cdk.Duration.days(1),
        minTtl: cdk.Duration.seconds(0),
        maxTtl: cdk.Duration.days(30),
        headerBehavior: cloudfront.CacheHeaderBehavior.none(),
        queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
        cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      }
    );
    const permissiveCachePolicy = new cloudfront.CachePolicy(
      this,
      "permissive",
      {
        defaultTtl: cdk.Duration.minutes(0),
        minTtl: cdk.Duration.minutes(0),
        maxTtl: cdk.Duration.days(30),
        cookieBehavior: cloudfront.CacheCookieBehavior.all(),
        queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
        headerBehavior: cloudfront.CacheHeaderBehavior.allowList(
          "Authorization",
          "Host"
        ),
      }
    );
    const distribution = new cloudfront.Distribution(this, "www", {
      certificate,
      domainNames: [domainName],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL,
      defaultBehavior: {
        origin: new origins.S3Origin(staticAssets),
        edgeLambdas: [
          {
            functionVersion: defaultHandler.currentVersion,
            eventType: cloudfront.LambdaEdgeEventType.ORIGIN_REQUEST,
          },
          {
            functionVersion: defaultHandler.currentVersion,
            eventType: cloudfront.LambdaEdgeEventType.ORIGIN_RESPONSE,
          },
        ],
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        compress: true,
        cachePolicy: permissiveCachePolicy,
      },
      additionalBehaviors: {
        "_next/static/*": {
          origin: new origins.S3Origin(staticAssets),
          cachePolicy: defaultCachePolicy,
        },
        "static/*": {
          origin: new origins.S3Origin(staticAssets),
          cachePolicy: defaultCachePolicy,
        },
        "api/*": {
          origin: new origins.S3Origin(staticAssets),
          edgeLambdas: [
            {
              functionVersion: apiHandler.currentVersion,
              includeBody: true,
              eventType: cloudfront.LambdaEdgeEventType.ORIGIN_REQUEST,
            },
          ],
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: permissiveCachePolicy,
        },
        "_next/data/*": {
          origin: new origins.S3Origin(staticAssets),
          edgeLambdas: [
            {
              functionVersion: defaultHandler.currentVersion,
              eventType: cloudfront.LambdaEdgeEventType.ORIGIN_REQUEST,
            },
            {
              functionVersion: defaultHandler.currentVersion,
              eventType: cloudfront.LambdaEdgeEventType.ORIGIN_RESPONSE,
            },
          ],
          cachePolicy: new cloudfront.CachePolicy(this, "data", {
            defaultTtl: cdk.Duration.minutes(0),
            minTtl: cdk.Duration.minutes(0),
            maxTtl: cdk.Duration.days(30),
            cookieBehavior: cloudfront.CacheCookieBehavior.all(),
            queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
            headerBehavior: cloudfront.CacheHeaderBehavior.allowList(
              "Authorization",
              "Host"
            ),
          }),
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        },
      },
    });

    new route53.ARecord(this, "ipv4-record", {
      zone: hostedZone,
      recordName: domainName,
      target: route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(distribution)
      ),
    });
    new route53.AaaaRecord(this, "ipv6-record", {
      zone: hostedZone,
      recordName: domainName,
      target: route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(distribution)
      ),
    });
  }
}
