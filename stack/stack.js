"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FaucetStack = void 0;
const path_1 = __importDefault(require("path"));
const cdk = __importStar(require("aws-cdk-lib"));
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const dynamodb = __importStar(require("aws-cdk-lib/aws-dynamodb"));
const origins = __importStar(require("aws-cdk-lib/aws-cloudfront-origins"));
const cloudfront = __importStar(require("aws-cdk-lib/aws-cloudfront"));
const ssm = __importStar(require("aws-cdk-lib/aws-ssm"));
const s3deploy = __importStar(require("aws-cdk-lib/aws-s3-deployment"));
class FaucetStack extends cdk.Stack {
    constructor(scope, id, props) {
        const { domain, ...rest } = props;
        super(scope, id, rest);
        const staticAssets = new s3.Bucket(this, "imageBucket", {
            transferAcceleration: true,
        });
        new s3deploy.BucketDeployment(this, "static-assets-deployment-3", {
            sources: [
                s3deploy.Source.asset(path_1.default.join(__dirname, "../.build/assets")),
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
        // const domains = domain instanceof Array ? domain : [domain];
        // const domainName = domains.join(".");
        // const hostedZone = route53.HostedZone.fromLookup(this, "HostedZone", {
        //   domainName: domains.length === 2 ? domains[1] : domains[0],
        // });
        // const certificate = new acm.DnsValidatedCertificate(this, "certificate", {
        //   domainName,
        //   hostedZone,
        //   region: props.env?.region,
        // });
        const apiHandler = new lambda.Function(this, "apiHandler", {
            runtime: lambda.Runtime.NODEJS_16_X,
            handler: "index.handler",
            code: lambda.Code.fromAsset(path_1.default.join(__dirname, "../.build/api-lambda")),
            memorySize: 512,
            timeout: cdk.Duration.seconds(10),
        });
        drinkerTable.grantReadWriteData(apiHandler);
        param.grantRead(apiHandler);
        const defaultHandler = new lambda.Function(this, "defaultHandler", {
            runtime: lambda.Runtime.NODEJS_16_X,
            handler: "index.handler",
            code: lambda.Code.fromAsset(path_1.default.join(__dirname, "../.build/default-lambda")),
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
        const defaultCachePolicy = new cloudfront.CachePolicy(this, "defaultCachePolicy", {
            defaultTtl: cdk.Duration.days(1),
            minTtl: cdk.Duration.seconds(0),
            maxTtl: cdk.Duration.days(30),
            headerBehavior: cloudfront.CacheHeaderBehavior.none(),
            queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
            cookieBehavior: cloudfront.CacheCookieBehavior.none(),
        });
        const permissiveCachePolicy = new cloudfront.CachePolicy(this, "permissive", {
            defaultTtl: cdk.Duration.minutes(0),
            minTtl: cdk.Duration.minutes(0),
            maxTtl: cdk.Duration.days(30),
            cookieBehavior: cloudfront.CacheCookieBehavior.all(),
            queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
            headerBehavior: cloudfront.CacheHeaderBehavior.allowList("Authorization", "Host"),
        });
        const distribution = new cloudfront.Distribution(this, "www", {
            // certificate,
            // domainNames: [domainName],
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
                        headerBehavior: cloudfront.CacheHeaderBehavior.allowList("Authorization", "Host"),
                    }),
                    allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
                },
            },
        });
        // new route53.ARecord(this, "ipv4-record", {
        //   zone: hostedZone,
        //   recordName: domainName,
        //   target: route53.RecordTarget.fromAlias(
        //     new targets.CloudFrontTarget(distribution)
        //   ),
        // });
        // new route53.AaaaRecord(this, "ipv6-record", {
        //   zone: hostedZone,
        //   recordName: domainName,
        //   target: route53.RecordTarget.fromAlias(
        //     new targets.CloudFrontTarget(distribution)
        //   ),
        // });
    }
}
exports.FaucetStack = FaucetStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJzdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGdEQUF3QjtBQUN4QixpREFBbUM7QUFDbkMsdURBQXlDO0FBQ3pDLCtEQUFpRDtBQUNqRCxtRUFBcUQ7QUFFckQsNEVBQThEO0FBQzlELHVFQUF5RDtBQUN6RCx5REFBMkM7QUFFM0Msd0VBQTBEO0FBTzFELE1BQWEsV0FBWSxTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQ3hDLFlBQVksS0FBYyxFQUFFLEVBQVUsRUFBRSxLQUFtQjtRQUN6RCxNQUFNLEVBQUUsTUFBTSxFQUFFLEdBQUcsSUFBSSxFQUFFLEdBQUcsS0FBSyxDQUFDO1FBQ2xDLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBRXZCLE1BQU0sWUFBWSxHQUFHLElBQUksRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsYUFBYSxFQUFFO1lBQ3RELG9CQUFvQixFQUFFLElBQUk7U0FDM0IsQ0FBQyxDQUFDO1FBQ0gsSUFBSSxRQUFRLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxFQUFFLDRCQUE0QixFQUFFO1lBQ2hFLE9BQU8sRUFBRTtnQkFDUCxRQUFRLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxjQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO2FBQ2hFO1lBQ0QsaUJBQWlCLEVBQUUsWUFBWTtTQUNoQyxDQUFDLENBQUM7UUFFSCxNQUFNLFlBQVksR0FBRyxJQUFJLFFBQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLFNBQVMsRUFBRTtZQUN2RCxZQUFZLEVBQUUsRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxRQUFRLENBQUMsYUFBYSxDQUFDLE1BQU0sRUFBRTtZQUNsRSxtQkFBbUIsRUFBRSxLQUFLO1lBQzFCLFVBQVUs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LFVBQVUsQ0FBQyx3QkFBd0IsQ0FBQyxHQUFHLEVBQUU7d0JBQzlELGNBQWMsRUFBRSxVQUFVLENBQUMsbUJBQW1CLENBQUMsU0FBUyxDQUN0RCxlQUFlLEVBQ2YsTUFBTSxDQUNQO3FCQUNGLENBQUM7b0JBQ0YsY0FBYyxFQUFFLFVBQVUsQ0FBQyxjQUFjLENBQUMsY0FBYztpQkFDekQ7YUFDRjtTQUNGLENBQUMsQ0FBQztRQUVILDZDQUE2QztRQUM3QyxzQkFBc0I7UUFDdEIsNEJBQTRCO1FBQzVCLDRDQUE0QztRQUM1QyxpREFBaUQ7UUFDakQsT0FBTztRQUNQLE1BQU07UUFDTixnREFBZ0Q7UUFDaEQsc0JBQXNCO1FBQ3RCLDRCQUE0QjtRQUM1Qiw0Q0FBNEM7UUFDNUMsaURBQWlEO1FBQ2pELE9BQU87UUFDUCxNQUFNO0lBQ1IsQ0FBQztDQUNGO0FBeExELGtDQXdMQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBwYXRoIGZyb20gXCJwYXRoXCI7XG5pbXBvcnQgKiBhcyBjZGsgZnJvbSBcImF3cy1jZGstbGliXCI7XG5pbXBvcnQgKiBhcyBzMyBmcm9tIFwiYXdzLWNkay1saWIvYXdzLXMzXCI7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSBcImF3cy1jZGstbGliL2F3cy1sYW1iZGFcIjtcbmltcG9ydCAqIGFzIGR5bmFtb2RiIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtZHluYW1vZGJcIjtcbmltcG9ydCAqIGFzIGFjbSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWNlcnRpZmljYXRlbWFuYWdlclwiO1xuaW1wb3J0ICogYXMgb3JpZ2lucyBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWNsb3VkZnJvbnQtb3JpZ2luc1wiO1xuaW1wb3J0ICogYXMgY2xvdWRmcm9udCBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWNsb3VkZnJvbnRcIjtcbmltcG9ydCAqIGFzIHNzbSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLXNzbVwiO1xuaW1wb3J0ICogYXMgcm91dGU1MyBmcm9tIFwiYXdzLWNkay1saWIvYXdzLXJvdXRlNTNcIjtcbmltcG9ydCAqIGFzIHMzZGVwbG95IGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtczMtZGVwbG95bWVudFwiO1xuaW1wb3J0ICogYXMgdGFyZ2V0cyBmcm9tIFwiYXdzLWNkay1saWIvYXdzLXJvdXRlNTMtdGFyZ2V0c1wiO1xuXG5leHBvcnQgaW50ZXJmYWNlIERpc2NvcmRQcm9wcyBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcbiAgcmVhZG9ubHkgZG9tYWluOiBbc3RyaW5nLCBzdHJpbmddIHwgc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgRmF1Y2V0U3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBjb25zdHJ1Y3RvcihzY29wZTogY2RrLkFwcCwgaWQ6IHN0cmluZywgcHJvcHM6IERpc2NvcmRQcm9wcykge1xuICAgIGNvbnN0IHsgZG9tYWluLCAuLi5yZXN0IH0gPSBwcm9wcztcbiAgICBzdXBlcihzY29wZSwgaWQsIHJlc3QpO1xuXG4gICAgY29uc3Qgc3RhdGljQXNzZXRzID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCBcImltYWdlQnVja2V0XCIsIHtcbiAgICAgIHRyYW5zZmVyQWNjZWxlcmF0aW9uOiB0cnVlLFxuICAgIH0pO1xuICAgIG5ldyBzM2RlcGxveS5CdWNrZXREZXBsb3ltZW50KHRoaXMsIFwic3RhdGljLWFzc2V0cy1kZXBsb3ltZW50LTNcIiwge1xuICAgICAgc291cmNlczogW1xuICAgICAgICBzM2RlcGxveS5Tb3VyY2UuYXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgXCIuLi8uYnVpbGQvYXNzZXRzXCIpKSxcbiAgICAgIF0sXG4gICAgICBkZXN0aW5hdGlvbkJ1Y2tldDogc3RhdGljQXNzZXRzLFxuICAgIH0pO1xuXG4gICAgY29uc3QgZHJpbmtlclRhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsIFwiRHJpbmtlclwiLCB7XG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogXCJrZXlcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHRpbWVUb0xpdmVBdHRyaWJ1dGU6IFwidHRsXCIsXG4gICAgICB0YWJsZUNsYXNzOiBkeW5hbW9kYi5UYWJsZUNsYXNzLlNUQU5EQVJELFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBhIG5ldyBTU00gUGFyYW1ldGVyIGhvbGRpbmcgdGhlIHRhYmxlIG5hbWUsIGJlY2F1c2Ugd2UgY2FuXG4gICAgLy8gbm90IHBhc3MgZW52IHZhcnMgaW50byBlZGdlIGxhbWJkYXNcbiAgICBjb25zdCBwYXJhbSA9IG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsIFwiRHJpbmtlclRhYmxlTmFtZVwiLCB7XG4gICAgICBkZXNjcmlwdGlvbjogXCJUaGUgZHJpbmtlciB0YWJsZSBmb3IgdGhlIHNlcG9saWEgZmF1Y2V0XCIsXG4gICAgICBwYXJhbWV0ZXJOYW1lOiBcIlNlcG9saWFfRHJpbmtlclRhYmxlTmFtZVwiLFxuICAgICAgc3RyaW5nVmFsdWU6IGRyaW5rZXJUYWJsZS50YWJsZU5hbWUsXG4gICAgfSk7XG5cbiAgICAvLyBEb21haW5cbiAgICAvLyBjb25zdCBkb21haW5zID0gZG9tYWluIGluc3RhbmNlb2YgQXJyYXkgPyBkb21haW4gOiBbZG9tYWluXTtcbiAgICAvLyBjb25zdCBkb21haW5OYW1lID0gZG9tYWlucy5qb2luKFwiLlwiKTtcbiAgICAvLyBjb25zdCBob3N0ZWRab25lID0gcm91dGU1My5Ib3N0ZWRab25lLmZyb21Mb29rdXAodGhpcywgXCJIb3N0ZWRab25lXCIsIHtcbiAgICAvLyAgIGRvbWFpbk5hbWU6IGRvbWFpbnMubGVuZ3RoID09PSAyID8gZG9tYWluc1sxXSA6IGRvbWFpbnNbMF0sXG4gICAgLy8gfSk7XG5cbiAgICAvLyBjb25zdCBjZXJ0aWZpY2F0ZSA9IG5ldyBhY20uRG5zVmFsaWRhdGVkQ2VydGlmaWNhdGUodGhpcywgXCJjZXJ0aWZpY2F0ZVwiLCB7XG4gICAgLy8gICBkb21haW5OYW1lLFxuICAgIC8vICAgaG9zdGVkWm9uZSxcbiAgICAvLyAgIHJlZ2lvbjogcHJvcHMuZW52Py5yZWdpb24sXG4gICAgLy8gfSk7XG5cbiAgICBjb25zdCBhcGlIYW5kbGVyID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcImFwaUhhbmRsZXJcIiwge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE2X1gsXG4gICAgICBoYW5kbGVyOiBcImluZGV4LmhhbmRsZXJcIixcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi4uLy5idWlsZC9hcGktbGFtYmRhXCIpKSxcbiAgICAgIG1lbW9yeVNpemU6IDUxMixcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDEwKSxcbiAgICB9KTtcbiAgICBkcmlua2VyVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGFwaUhhbmRsZXIpO1xuICAgIHBhcmFtLmdyYW50UmVhZChhcGlIYW5kbGVyKTtcblxuICAgIGNvbnN0IGRlZmF1bHRIYW5kbGVyID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcImRlZmF1bHRIYW5kbGVyXCIsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xNl9YLFxuICAgICAgaGFuZGxlcjogXCJpbmRleC5oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXG4gICAgICAgIHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLi4vLmJ1aWxkL2RlZmF1bHQtbGFtYmRhXCIpXG4gICAgICApLFxuICAgICAgbWVtb3J5U2l6ZTogNTEyLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTApLFxuICAgIH0pO1xuXG4gICAgLy8gY29uc3QgaW1hZ2VIYW5kbGVyID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcImltYWdlSGFuZGxlclwiLCB7XG4gICAgLy8gICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTZfWCxcbiAgICAvLyAgIGhhbmRsZXI6IFwiaW5kZXguaGFuZGxlclwiLFxuICAgIC8vICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFxuICAgIC8vICAgICBwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi4uLy5idWlsZC9pbWFnZS1sYW1iZGFcIilcbiAgICAvLyAgICksXG4gICAgLy8gICBtZW1vcnlTaXplOiA1MTIsXG4gICAgLy8gICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygxMCksXG4gICAgLy8gfSk7XG4gICAgLy8gc3RhdGljQXNzZXRzLmdyYW50UmVhZFdyaXRlKGltYWdlSGFuZGxlcik7XG4gICAgY29uc3QgZGVmYXVsdENhY2hlUG9saWN5ID0gbmV3IGNsb3VkZnJvbnQuQ2FjaGVQb2xpY3koXG4gICAgICB0aGlzLFxuICAgICAgXCJkZWZhdWx0Q2FjaGVQb2xpY3lcIixcbiAgICAgIHtcbiAgICAgICAgZGVmYXVsdFR0bDogY2RrLkR1cmF0aW9uLmRheXMoMSksXG4gICAgICAgIG1pblR0bDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMCksXG4gICAgICAgIG1heFR0bDogY2RrLkR1cmF0aW9uLmRheXMoMzApLFxuICAgICAgICBoZWFkZXJCZWhhdmlvcjogY2xvdWRmcm9udC5DYWNoZUhlYWRlckJlaGF2aW9yLm5vbmUoKSxcbiAgICAgICAgcXVlcnlTdHJpbmdCZWhhdmlvcjogY2xvdWRmcm9udC5DYWNoZVF1ZXJ5U3RyaW5nQmVoYXZpb3Iubm9uZSgpLFxuICAgICAgICBjb29raWVCZWhhdmlvcjogY2xvdWRmcm9udC5DYWNoZUNvb2tpZUJlaGF2aW9yLm5vbmUoKSxcbiAgICAgIH1cbiAgICApO1xuICAgIGNvbnN0IHBlcm1pc3NpdmVDYWNoZVBvbGljeSA9IG5ldyBjbG91ZGZyb250LkNhY2hlUG9saWN5KFxuICAgICAgdGhpcyxcbiAgICAgIFwicGVybWlzc2l2ZVwiLFxuICAgICAge1xuICAgICAgICBkZWZhdWx0VHRsOiBjZGsuRHVyYXRpb24ubWludXRlcygwKSxcbiAgICAgICAgbWluVHRsOiBjZGsuRHVyYXRpb24ubWludXRlcygwKSxcbiAgICAgICAgbWF4VHRsOiBjZGsuRHVyYXRpb24uZGF5cygzMCksXG4gICAgICAgIGNvb2tpZUJlaGF2aW9yOiBjbG91ZGZyb250LkNhY2hlQ29va2llQmVoYXZpb3IuYWxsKCksXG4gICAgICAgIHF1ZXJ5U3RyaW5nQmVoYXZpb3I6IGNsb3VkZnJvbnQuQ2FjaGVRdWVyeVN0cmluZ0JlaGF2aW9yLmFsbCgpLFxuICAgICAgICBoZWFkZXJCZWhhdmlvcjogY2xvdWRmcm9udC5DYWNoZUhlYWRlckJlaGF2aW9yLmFsbG93TGlzdChcbiAgICAgICAgICBcIkF1dGhvcml6YXRpb25cIixcbiAgICAgICAgICBcIkhvc3RcIlxuICAgICAgICApLFxuICAgICAgfVxuICAgICk7XG4gICAgY29uc3QgZGlzdHJpYnV0aW9uID0gbmV3IGNsb3VkZnJvbnQuRGlzdHJpYnV0aW9uKHRoaXMsIFwid3d3XCIsIHtcbiAgICAgIC8vIGNlcnRpZmljYXRlLFxuICAgICAgLy8gZG9tYWluTmFtZXM6IFtkb21haW5OYW1lXSxcbiAgICAgIHByaWNlQ2xhc3M6IGNsb3VkZnJvbnQuUHJpY2VDbGFzcy5QUklDRV9DTEFTU19BTEwsXG4gICAgICBkZWZhdWx0QmVoYXZpb3I6IHtcbiAgICAgICAgb3JpZ2luOiBuZXcgb3JpZ2lucy5TM09yaWdpbihzdGF0aWNBc3NldHMpLFxuICAgICAgICBlZGdlTGFtYmRhczogW1xuICAgICAgICAgIHtcbiAgICAgICAgICAgIGZ1bmN0aW9uVmVyc2lvbjogZGVmYXVsdEhhbmRsZXIuY3VycmVudFZlcnNpb24sXG4gICAgICAgICAgICBldmVudFR5cGU6IGNsb3VkZnJvbnQuTGFtYmRhRWRnZUV2ZW50VHlwZS5PUklHSU5fUkVRVUVTVCxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIGZ1bmN0aW9uVmVyc2lvbjogZGVmYXVsdEhhbmRsZXIuY3VycmVudFZlcnNpb24sXG4gICAgICAgICAgICBldmVudFR5cGU6IGNsb3VkZnJvbnQuTGFtYmRhRWRnZUV2ZW50VHlwZS5PUklHSU5fUkVTUE9OU0UsXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgICAgYWxsb3dlZE1ldGhvZHM6IGNsb3VkZnJvbnQuQWxsb3dlZE1ldGhvZHMuQUxMT1dfQUxMLFxuICAgICAgICBjb21wcmVzczogdHJ1ZSxcbiAgICAgICAgY2FjaGVQb2xpY3k6IHBlcm1pc3NpdmVDYWNoZVBvbGljeSxcbiAgICAgIH0sXG4gICAgICBhZGRpdGlvbmFsQmVoYXZpb3JzOiB7XG4gICAgICAgIFwiX25leHQvc3RhdGljLypcIjoge1xuICAgICAgICAgIG9yaWdpbjogbmV3IG9yaWdpbnMuUzNPcmlnaW4oc3RhdGljQXNzZXRzKSxcbiAgICAgICAgICBjYWNoZVBvbGljeTogZGVmYXVsdENhY2hlUG9saWN5LFxuICAgICAgICB9LFxuICAgICAgICBcInN0YXRpYy8qXCI6IHtcbiAgICAgICAgICBvcmlnaW46IG5ldyBvcmlnaW5zLlMzT3JpZ2luKHN0YXRpY0Fzc2V0cyksXG4gICAgICAgICAgY2FjaGVQb2xpY3k6IGRlZmF1bHRDYWNoZVBvbGljeSxcbiAgICAgICAgfSxcbiAgICAgICAgXCJhcGkvKlwiOiB7XG4gICAgICAgICAgb3JpZ2luOiBuZXcgb3JpZ2lucy5TM09yaWdpbihzdGF0aWNBc3NldHMpLFxuICAgICAgICAgIGVkZ2VMYW1iZGFzOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIGZ1bmN0aW9uVmVyc2lvbjogYXBpSGFuZGxlci5jdXJyZW50VmVyc2lvbixcbiAgICAgICAgICAgICAgaW5jbHVkZUJvZHk6IHRydWUsXG4gICAgICAgICAgICAgIGV2ZW50VHlwZTogY2xvdWRmcm9udC5MYW1iZGFFZGdlRXZlbnRUeXBlLk9SSUdJTl9SRVFVRVNULFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICBdLFxuICAgICAgICAgIGFsbG93ZWRNZXRob2RzOiBjbG91ZGZyb250LkFsbG93ZWRNZXRob2RzLkFMTE9XX0FMTCxcbiAgICAgICAgICBjYWNoZVBvbGljeTogcGVybWlzc2l2ZUNhY2hlUG9saWN5LFxuICAgICAgICB9LFxuICAgICAgICBcIl9uZXh0L2RhdGEvKlwiOiB7XG4gICAgICAgICAgb3JpZ2luOiBuZXcgb3JpZ2lucy5TM09yaWdpbihzdGF0aWNBc3NldHMpLFxuICAgICAgICAgIGVkZ2VMYW1iZGFzOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIGZ1bmN0aW9uVmVyc2lvbjogZGVmYXVsdEhhbmRsZXIuY3VycmVudFZlcnNpb24sXG4gICAgICAgICAgICAgIGV2ZW50VHlwZTogY2xvdWRmcm9udC5MYW1iZGFFZGdlRXZlbnRUeXBlLk9SSUdJTl9SRVFVRVNULFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgZnVuY3Rpb25WZXJzaW9uOiBkZWZhdWx0SGFuZGxlci5jdXJyZW50VmVyc2lvbixcbiAgICAgICAgICAgICAgZXZlbnRUeXBlOiBjbG91ZGZyb250LkxhbWJkYUVkZ2VFdmVudFR5cGUuT1JJR0lOX1JFU1BPTlNFLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICBdLFxuICAgICAgICAgIGNhY2hlUG9saWN5OiBuZXcgY2xvdWRmcm9udC5DYWNoZVBvbGljeSh0aGlzLCBcImRhdGFcIiwge1xuICAgICAgICAgICAgZGVmYXVsdFR0bDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMCksXG4gICAgICAgICAgICBtaW5UdGw6IGNkay5EdXJhdGlvbi5taW51dGVzKDApLFxuICAgICAgICAgICAgbWF4VHRsOiBjZGsuRHVyYXRpb24uZGF5cygzMCksXG4gICAgICAgICAgICBjb29raWVCZWhhdmlvcjogY2xvdWRmcm9udC5DYWNoZUNvb2tpZUJlaGF2aW9yLmFsbCgpLFxuICAgICAgICAgICAgcXVlcnlTdHJpbmdCZWhhdmlvcjogY2xvdWRmcm9udC5DYWNoZVF1ZXJ5U3RyaW5nQmVoYXZpb3IuYWxsKCksXG4gICAgICAgICAgICBoZWFkZXJCZWhhdmlvcjogY2xvdWRmcm9udC5DYWNoZUhlYWRlckJlaGF2aW9yLmFsbG93TGlzdChcbiAgICAgICAgICAgICAgXCJBdXRob3JpemF0aW9uXCIsXG4gICAgICAgICAgICAgIFwiSG9zdFwiXG4gICAgICAgICAgICApLFxuICAgICAgICAgIH0pLFxuICAgICAgICAgIGFsbG93ZWRNZXRob2RzOiBjbG91ZGZyb250LkFsbG93ZWRNZXRob2RzLkFMTE9XX0dFVF9IRUFELFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIG5ldyByb3V0ZTUzLkFSZWNvcmQodGhpcywgXCJpcHY0LXJlY29yZFwiLCB7XG4gICAgLy8gICB6b25lOiBob3N0ZWRab25lLFxuICAgIC8vICAgcmVjb3JkTmFtZTogZG9tYWluTmFtZSxcbiAgICAvLyAgIHRhcmdldDogcm91dGU1My5SZWNvcmRUYXJnZXQuZnJvbUFsaWFzKFxuICAgIC8vICAgICBuZXcgdGFyZ2V0cy5DbG91ZEZyb250VGFyZ2V0KGRpc3RyaWJ1dGlvbilcbiAgICAvLyAgICksXG4gICAgLy8gfSk7XG4gICAgLy8gbmV3IHJvdXRlNTMuQWFhYVJlY29yZCh0aGlzLCBcImlwdjYtcmVjb3JkXCIsIHtcbiAgICAvLyAgIHpvbmU6IGhvc3RlZFpvbmUsXG4gICAgLy8gICByZWNvcmROYW1lOiBkb21haW5OYW1lLFxuICAgIC8vICAgdGFyZ2V0OiByb3V0ZTUzLlJlY29yZFRhcmdldC5mcm9tQWxpYXMoXG4gICAgLy8gICAgIG5ldyB0YXJnZXRzLkNsb3VkRnJvbnRUYXJnZXQoZGlzdHJpYnV0aW9uKVxuICAgIC8vICAgKSxcbiAgICAvLyB9KTtcbiAgfVxufVxuIl19