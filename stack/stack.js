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
const acm = __importStar(require("aws-cdk-lib/aws-certificatemanager"));
const origins = __importStar(require("aws-cdk-lib/aws-cloudfront-origins"));
const cloudfront = __importStar(require("aws-cdk-lib/aws-cloudfront"));
const ssm = __importStar(require("aws-cdk-lib/aws-ssm"));
const route53 = __importStar(require("aws-cdk-lib/aws-route53"));
const s3deploy = __importStar(require("aws-cdk-lib/aws-s3-deployment"));
const targets = __importStar(require("aws-cdk-lib/aws-route53-targets"));
class FaucetStack extends cdk.Stack {
    constructor(scope, id, props) {
        var _a;
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
        const domains = domain instanceof Array ? domain : [domain];
        const domainName = domains.join(".");
        const hostedZone = route53.HostedZone.fromLookup(this, "HostedZone", {
            domainName: domains.length === 2 ? domains[1] : domains[0],
        });
        const certificate = new acm.DnsValidatedCertificate(this, "certificate", {
            domainName,
            hostedZone,
            region: (_a = props.env) === null || _a === void 0 ? void 0 : _a.region,
        });
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
                        headerBehavior: cloudfront.CacheHeaderBehavior.allowList("Authorization", "Host"),
                    }),
                    allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
                },
            },
        });
        new route53.ARecord(this, "ipv4-record", {
            zone: hostedZone,
            recordName: domainName,
            target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
        });
        new route53.AaaaRecord(this, "ipv6-record", {
            zone: hostedZone,
            recordName: domainName,
            target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
        });
    }
}
exports.FaucetStack = FaucetStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJzdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGdEQUF3QjtBQUN4QixpREFBbUM7QUFDbkMsdURBQXlDO0FBQ3pDLCtEQUFpRDtBQUNqRCxtRUFBcUQ7QUFDckQsd0VBQTBEO0FBQzFELDRFQUE4RDtBQUM5RCx1RUFBeUQ7QUFDekQseURBQTJDO0FBQzNDLGlFQUFtRDtBQUNuRCx3RUFBMEQ7QUFDMUQseUVBQTJEO0FBTTNELE1BQWEsV0FBWSxTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQ3hDLFlBQVksS0FBYyxFQUFFLEVBQVUsRUFBRSxLQUFtQjs7UUFDekQsTUFBTSxFQUFFLE1BQU0sRUFBRSxHQUFHLElBQUksRUFBRSxHQUFHLEtBQUssQ0FBQztRQUNsQyxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUV2QixNQUFNLFlBQVksR0FBRyxJQUFJLEVBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLGFBQWEsRUFBRTtZQUN0RCxvQkFBb0IsRUFBRSxJQUFJO1NBQzNCLENBQUMsQ0FBQztRQUNILElBQUksUUFBUSxDQUFDLGdCQUFnQixDQUFDLElBQUksRUFBRSw0QkFBNEIsRUFBRTtZQUNoRSxPQUFPLEVBQUU7Z0JBQ1AsUUFBUSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsY0FBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsa0JBQWtCLENBQUMsQ0FBQzthQUNoRTtZQUNELGlCQUFpQixFQUFFLFlBQVk7U0FDaEMsQ0FBQyxDQUFDO1FBRUgsTUFBTSxZQUFZLEdBQUcsSUFBSSxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxTQUFTLEVBQUU7WUFDdkQsWUFBWSxFQUFFLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLGFBQWEsQ0FBQyxNQUFNLEVBQUU7WUFDbEUsbUJBQW1CLEVBQUUsS0FBSztZQUMxQixVQUFVLEVBQUUsUUFBUSxDQUFDLFVBQVUsQ0FBQyxRQUFRO1lBQ3hDLFdBQVcsRUFBRSxRQUFRLENBQUMsV0FBVyxDQUFDLGVBQWU7U0FDbEQsQ0FBQyxDQUFDO1FBRUgsb0VBQW9FO1FBQ3BFLHNDQUFzQztRQUN0QyxNQUFNLEtBQUssR0FBRyxJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQUMsSUFBSSxFQUFFLGtCQUFrQixFQUFFO1lBQzlELFdBQVcsRUFBRSwwQ0FBMEM7WUFDdkQsYUFBYSxFQUFFLDBCQUEwQjtZQUN6QyxXQUFXLEVBQUUsWUFBWSxDQUFDLFNBQVM7U0FDcEMsQ0FBQyxDQUFDO1FBRUgsU0FBUztRQUNULE1BQU0sT0FBTyxHQUFHLE1BQU0sWUFBWSxLQUFLLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUM1RCxNQUFNLFVBQVUsR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3JDLE1BQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyxVQUFVLENBQUMsVUFBVSxDQUFDLElBQUksRUFBRSxZQUFZLEVBQUU7WUFDbkUsVUFBVSxFQUFFLE9BQU8sQ0FBQyxNQUFNLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7U0FDM0QsQ0FBQyxDQUFDO1FBRUgsTUFBTSxXQUFXLEdBQUcsSUFBSSxHQUFHLENBQUMsdUJBQXVCLENBQUMsSUFBSSxFQUFFLGFBQWEsRUFBRTtZQUN2RSxVQUFVO1lBQ1YsVUFBVTtZQUNWLE1BQU0sRUFBRSxNQUFBLEtBQUssQ0FBQyxHQUFHLDBDQUFFLE1BQU07U0FDMUIsQ0FBQyxDQUFDO1FBRUgsTUFBTSxVQUFVLEdBQUcsSUFBSSxNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxZQUFZLEVBQUU7WUFDekQsT0FBTyxFQUFFLE1BQU0sQ0FBQyxPQUFPLENBQUMsV0FBVztZQUNuQyxPQUFPLEVBQUUsZUFBZTtZQUN4QixJQUFJLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsY0FBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsc0JBQXNCLENBQUMsQ0FBQztZQUN6RSxVQUFVLEVBQUUsR0FBRztZQUNmLE9BQU8sRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7U0FDbEMsQ0FBQyxDQUFDO1FBQ0gsWUFBWSxDQUFDLGtCQUFrQixDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQzVDLEtBQUssQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLENBQUM7UUFFNUIsTUFBTSxjQUFjLEdBQUcsSUFBSSxNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZQUNqRSxPQUFPLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxXQUFXO1lBQ25DLE9BQU8sRUFBRSxlQUFlO1lBQ3hCLElBQUksRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FDekIsY0FBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsMEJBQTBCLENBQUMsQ0FDakQ7WUFDRCxVQUFVLEVBQUUsR0FBRztZQUNmLE9BQU8sRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7U0FDbEMsQ0FBQyxDQUFDO1FBRUgsbUVBQW1FO1FBQ25FLHlDQUF5QztRQUN6Qyw4QkFBOEI7UUFDOUIsaUNBQWlDO1FBQ2pDLHFEQUFxRDtRQUNyRCxPQUFPO1FBQ1AscUJBQXFCO1FBQ3JCLHVDQUF1QztRQUN2QyxNQUFNO1FBQ04sNkNBQTZDO1FBQzdDLE1BQU0sa0JBQWtCLEdBQUcsSUFBSSxVQUFVLENBQUMsV0FBVyxDQUNuRCxJQUFJLEVBQ0osb0JBQW9CLEVBQ3BCO1lBQ0UsVUFBVSxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUNoQyxNQUFNLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQy9CLE1BQU0sRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDN0IsY0FBYyxFQUFFLFVBQVUsQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLEVBQUU7WUFDckQsbUJBQW1CLEVBQUUsVUFBVSxDQUFDLHdCQUF3QixDQUFDLElBQUksRUFBRTtZQUMvRCxjQUFjLEVBQUUsVUFBVSxDQUFDLG1CQUFtQixDQUFDLElBQUksRUFBRTtTQUN0RCxDQUNGLENBQUM7UUFDRixNQUFNLHFCQUFxQixHQUFHLElBQUksVUFBVSxDQUFDLFdBQVcsQ0FDdEQsSUFBSSxFQUNKLFlBQVksRUFDWjtZQUNFLFVBQVUsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7WUFDbkMsTUFBTSxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztZQUMvQixNQUFNLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQzdCLGNBQWMsRUFBRSxVQUFVLENBQUMsbUJBQW1CLENBQUMsR0FBRyxFQUFFO1lBQ3BELG1CQUFtQixFQUFFLFVBQVUsQ0FBQyx3QkFBd0IsQ0FBQyxHQUFHLEVBQUU7WUFDOUQsY0FBYyxFQUFFLFVBQVUsQ0FBQyxtQkFBbUIsQ0FBQyxTQUFTLENBQ3RELGVBQWUsRUFDZixNQUFNLENBQ1A7U0FDRixDQUNGLENBQUM7UUFDRixNQUFNLFlBQVksR0FBRyxJQUFJLFVBQVUsQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRTtZQUM1RCxXQUFXO1lBQ1gsV0FBVyxFQUFFLENBQUMsVUFBVSxDQUFDO1lBQ3pCLFVBQVUsRUFBRSxVQUFVLENBQUMsVUFBVSxDQUFDLGVBQWU7WUFDakQsZUFBZSxFQUFFO2dCQUNmLE1BQU0sRUFBRSxJQUFJLE9BQU8sQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDO2dCQUMxQyxXQUFXLEVBQUU7b0JBQ1g7d0JBQ0UsZUFBZSxFQUFFLGNBQWMsQ0FBQyxjQUFjO3dCQUM5QyxTQUFTLEVBQUUsVUFBVSxDQUFDLG1CQUFtQixDQUFDLGNBQWM7cUJBQ3pEO29CQUNEO3dCQUNFLGVBQWUsRUFBRSxjQUFjLENBQUMsY0FBYzt3QkFDOUMsU0FBUyxFQUFFLFVBQVUsQ0FBQyxtQkFBbUIsQ0FBQyxlQUFlO3FCQUMxRDtpQkFDRjtnQkFDRCxjQUFjLEVBQUUsVUFBVSxDQUFDLGNBQWMsQ0FBQyxTQUFTO2dCQUNuRCxRQUFRLEVBQUUsSUFBSTtnQkFDZCxXQUFXLEVBQUUscUJBQXFCO2FBQ25DO1lBQ0QsbUJBQW1CLEVBQUU7Z0JBQ25CLGdCQUFnQixFQUFFO29CQUNoQixNQUFNLEVBQUUsSUFBSSxPQUFPLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQztvQkFDMUMsV0FBVyxFQUFFLGtCQUFrQjtpQkFDaEM7Z0JBQ0QsVUFBVSxFQUFFO29CQUNWLE1BQU0sRUFBRSxJQUFJLE9BQU8sQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDO29CQUMxQyxXQUFXLEVBQUUsa0JBQWtCO2lCQUNoQztnQkFDRCxPQUFPLEVBQUU7b0JBQ1AsTUFBTSxFQUFFLElBQUksT0FBTyxDQUFDLFFBQVEsQ0FBQyxZQUFZLENBQUM7b0JBQzFDLFdBQVcsRUFBRTt3QkFDWDs0QkFDRSxlQUFlLEVBQUUsVUFBVSxDQUFDLGNBQWM7NEJBQzFDLFdBQVcsRUFBRSxJQUFJOzRCQUNqQixTQUFTLEVBQUUsVUFBVSxDQUFDLG1CQUFtQixDQUFDLGNBQWM7eUJBQ3pEO3FCQUNGO29CQUNELGNBQWMsRUFBRSxVQUFVLENBQUMsY0FBYyxDQUFDLFNBQVM7b0JBQ25ELFdBQVcsRUFBRSxxQkFBcUI7aUJBQ25DO2dCQUNELGNBQWMsRUFBRTtvQkFDZCxNQUFNLEVBQUUsSUFBSSxPQUFPLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQztvQkFDMUMsV0FBVyxFQUFFO3dCQUNYOzRCQUNFLGVBQWUsRUFBRSxjQUFjLENBQUMsY0FBYzs0QkFDOUMsU0FBUyxFQUFFLFVBQVUsQ0FBQyxtQkFBbUIsQ0FBQyxjQUFjO3lCQUN6RDt3QkFDRDs0QkFDRSxlQUFlLEVBQUUsY0FBYyxDQUFDLGNBQWM7NEJBQzlDLFNBQVMsRUFBRSxVQUFVLENBQUMsbUJBQW1CLENBQUMsZUFBZTt5QkFDMUQ7cUJBQ0Y7b0JBQ0QsV0FBVyxFQUFFLElBQUksVUFBVSxDQUFDLFdBQVcsQ0FBQyxJQUFJLEVBQUUsTUFBTSxFQUFFO3dCQUNwRCxVQUFVLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO3dCQUNuQyxNQUFNLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO3dCQUMvQixNQUFNLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO3dCQUM3QixjQUFjLEVBQUUsVUFBVSxDQUFDLG1CQUFtQixDQUFDLEdBQUcsRUFBRTt3QkFDcEQsbUJBQW1CLEVBQUUsVUFBVSxDQUFDLHdCQUF3QixDQUFDLEdBQUcsRUFBRTt3QkFDOUQsY0FBYyxFQUFFLFVBQVUsQ0FBQyxtQkFBbUIsQ0FBQyxTQUFTLENBQ3RELGVBQWUsRUFDZixNQUFNLENBQ1A7cUJBQ0YsQ0FBQztvQkFDRixjQUFjLEVBQUUsVUFBVSxDQUFDLGNBQWMsQ0FBQyxjQUFjO2lCQUN6RDthQUNGO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsSUFBSSxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxhQUFhLEVBQUU7WUFDdkMsSUFBSSxFQUFFLFVBQVU7WUFDaEIsVUFBVSxFQUFFLFVBQVU7WUFDdEIsTUFBTSxFQUFFLE9BQU8sQ0FBQyxZQUFZLENBQUMsU0FBUyxDQUNwQyxJQUFJLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxZQUFZLENBQUMsQ0FDM0M7U0FDRixDQUFDLENBQUM7UUFDSCxJQUFJLE9BQU8sQ0FBQyxVQUFVLENBQUMsSUFBSSxFQUFFLGFBQWEsRUFBRTtZQUMxQyxJQUFJLEVBQUUsVUFBVTtZQUNoQixVQUFVLEVBQUUsVUFBVTtZQUN0QixNQUFNLEVBQUUsT0FBTyxDQUFDLFlBQVksQ0FBQyxTQUFTLENBQ3BDLElBQUksT0FBTyxDQUFDLGdCQUFnQixDQUFDLFlBQVksQ0FBQyxDQUMzQztTQUNGLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQXhMRCxrQ0F3TEMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgcGF0aCBmcm9tIFwicGF0aFwiO1xuaW1wb3J0ICogYXMgY2RrIGZyb20gXCJhd3MtY2RrLWxpYlwiO1xuaW1wb3J0ICogYXMgczMgZnJvbSBcImF3cy1jZGstbGliL2F3cy1zM1wiO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtbGFtYmRhXCI7XG5pbXBvcnQgKiBhcyBkeW5hbW9kYiBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWR5bmFtb2RiXCI7XG5pbXBvcnQgKiBhcyBhY20gZnJvbSBcImF3cy1jZGstbGliL2F3cy1jZXJ0aWZpY2F0ZW1hbmFnZXJcIjtcbmltcG9ydCAqIGFzIG9yaWdpbnMgZnJvbSBcImF3cy1jZGstbGliL2F3cy1jbG91ZGZyb250LW9yaWdpbnNcIjtcbmltcG9ydCAqIGFzIGNsb3VkZnJvbnQgZnJvbSBcImF3cy1jZGstbGliL2F3cy1jbG91ZGZyb250XCI7XG5pbXBvcnQgKiBhcyBzc20gZnJvbSBcImF3cy1jZGstbGliL2F3cy1zc21cIjtcbmltcG9ydCAqIGFzIHJvdXRlNTMgZnJvbSBcImF3cy1jZGstbGliL2F3cy1yb3V0ZTUzXCI7XG5pbXBvcnQgKiBhcyBzM2RlcGxveSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLXMzLWRlcGxveW1lbnRcIjtcbmltcG9ydCAqIGFzIHRhcmdldHMgZnJvbSBcImF3cy1jZGstbGliL2F3cy1yb3V0ZTUzLXRhcmdldHNcIjtcblxuZXhwb3J0IGludGVyZmFjZSBEaXNjb3JkUHJvcHMgZXh0ZW5kcyBjZGsuU3RhY2tQcm9wcyB7XG4gIHJlYWRvbmx5IGRvbWFpbjogW3N0cmluZywgc3RyaW5nXSB8IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIEZhdWNldFN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IGNkay5BcHAsIGlkOiBzdHJpbmcsIHByb3BzOiBEaXNjb3JkUHJvcHMpIHtcbiAgICBjb25zdCB7IGRvbWFpbiwgLi4ucmVzdCB9ID0gcHJvcHM7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCByZXN0KTtcblxuICAgIGNvbnN0IHN0YXRpY0Fzc2V0cyA9IG5ldyBzMy5CdWNrZXQodGhpcywgXCJpbWFnZUJ1Y2tldFwiLCB7XG4gICAgICB0cmFuc2ZlckFjY2VsZXJhdGlvbjogdHJ1ZSxcbiAgICB9KTtcbiAgICBuZXcgczNkZXBsb3kuQnVja2V0RGVwbG95bWVudCh0aGlzLCBcInN0YXRpYy1hc3NldHMtZGVwbG95bWVudC0zXCIsIHtcbiAgICAgIHNvdXJjZXM6IFtcbiAgICAgICAgczNkZXBsb3kuU291cmNlLmFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLi4vLmJ1aWxkL2Fzc2V0c1wiKSksXG4gICAgICBdLFxuICAgICAgZGVzdGluYXRpb25CdWNrZXQ6IHN0YXRpY0Fzc2V0cyxcbiAgICB9KTtcblxuICAgIGNvbnN0IGRyaW5rZXJUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCBcIkRyaW5rZXJcIiwge1xuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6IFwia2V5XCIsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICB0aW1lVG9MaXZlQXR0cmlidXRlOiBcInR0bFwiLFxuICAgICAgdGFibGVDbGFzczogZHluYW1vZGIuVGFibGVDbGFzcy5TVEFOREFSRCxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgYSBuZXcgU1NNIFBhcmFtZXRlciBob2xkaW5nIHRoZSB0YWJsZSBuYW1lLCBiZWNhdXNlIHdlIGNhblxuICAgIC8vIG5vdCBwYXNzIGVudiB2YXJzIGludG8gZWRnZSBsYW1iZGFzXG4gICAgY29uc3QgcGFyYW0gPSBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcih0aGlzLCBcIkRyaW5rZXJUYWJsZU5hbWVcIiwge1xuICAgICAgZGVzY3JpcHRpb246IFwiVGhlIGRyaW5rZXIgdGFibGUgZm9yIHRoZSBzZXBvbGlhIGZhdWNldFwiLFxuICAgICAgcGFyYW1ldGVyTmFtZTogXCJTZXBvbGlhX0RyaW5rZXJUYWJsZU5hbWVcIixcbiAgICAgIHN0cmluZ1ZhbHVlOiBkcmlua2VyVGFibGUudGFibGVOYW1lLFxuICAgIH0pO1xuXG4gICAgLy8gRG9tYWluXG4gICAgY29uc3QgZG9tYWlucyA9IGRvbWFpbiBpbnN0YW5jZW9mIEFycmF5ID8gZG9tYWluIDogW2RvbWFpbl07XG4gICAgY29uc3QgZG9tYWluTmFtZSA9IGRvbWFpbnMuam9pbihcIi5cIik7XG4gICAgY29uc3QgaG9zdGVkWm9uZSA9IHJvdXRlNTMuSG9zdGVkWm9uZS5mcm9tTG9va3VwKHRoaXMsIFwiSG9zdGVkWm9uZVwiLCB7XG4gICAgICBkb21haW5OYW1lOiBkb21haW5zLmxlbmd0aCA9PT0gMiA/IGRvbWFpbnNbMV0gOiBkb21haW5zWzBdLFxuICAgIH0pO1xuXG4gICAgY29uc3QgY2VydGlmaWNhdGUgPSBuZXcgYWNtLkRuc1ZhbGlkYXRlZENlcnRpZmljYXRlKHRoaXMsIFwiY2VydGlmaWNhdGVcIiwge1xuICAgICAgZG9tYWluTmFtZSxcbiAgICAgIGhvc3RlZFpvbmUsXG4gICAgICByZWdpb246IHByb3BzLmVudj8ucmVnaW9uLFxuICAgIH0pO1xuXG4gICAgY29uc3QgYXBpSGFuZGxlciA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJhcGlIYW5kbGVyXCIsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xNl9YLFxuICAgICAgaGFuZGxlcjogXCJpbmRleC5oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgXCIuLi8uYnVpbGQvYXBpLWxhbWJkYVwiKSksXG4gICAgICBtZW1vcnlTaXplOiA1MTIsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygxMCksXG4gICAgfSk7XG4gICAgZHJpbmtlclRhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShhcGlIYW5kbGVyKTtcbiAgICBwYXJhbS5ncmFudFJlYWQoYXBpSGFuZGxlcik7XG5cbiAgICBjb25zdCBkZWZhdWx0SGFuZGxlciA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJkZWZhdWx0SGFuZGxlclwiLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTZfWCxcbiAgICAgIGhhbmRsZXI6IFwiaW5kZXguaGFuZGxlclwiLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFxuICAgICAgICBwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi4uLy5idWlsZC9kZWZhdWx0LWxhbWJkYVwiKVxuICAgICAgKSxcbiAgICAgIG1lbW9yeVNpemU6IDUxMixcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDEwKSxcbiAgICB9KTtcblxuICAgIC8vIGNvbnN0IGltYWdlSGFuZGxlciA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJpbWFnZUhhbmRsZXJcIiwge1xuICAgIC8vICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE2X1gsXG4gICAgLy8gICBoYW5kbGVyOiBcImluZGV4LmhhbmRsZXJcIixcbiAgICAvLyAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcbiAgICAvLyAgICAgcGF0aC5qb2luKF9fZGlybmFtZSwgXCIuLi8uYnVpbGQvaW1hZ2UtbGFtYmRhXCIpXG4gICAgLy8gICApLFxuICAgIC8vICAgbWVtb3J5U2l6ZTogNTEyLFxuICAgIC8vICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTApLFxuICAgIC8vIH0pO1xuICAgIC8vIHN0YXRpY0Fzc2V0cy5ncmFudFJlYWRXcml0ZShpbWFnZUhhbmRsZXIpO1xuICAgIGNvbnN0IGRlZmF1bHRDYWNoZVBvbGljeSA9IG5ldyBjbG91ZGZyb250LkNhY2hlUG9saWN5KFxuICAgICAgdGhpcyxcbiAgICAgIFwiZGVmYXVsdENhY2hlUG9saWN5XCIsXG4gICAgICB7XG4gICAgICAgIGRlZmF1bHRUdGw6IGNkay5EdXJhdGlvbi5kYXlzKDEpLFxuICAgICAgICBtaW5UdGw6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDApLFxuICAgICAgICBtYXhUdGw6IGNkay5EdXJhdGlvbi5kYXlzKDMwKSxcbiAgICAgICAgaGVhZGVyQmVoYXZpb3I6IGNsb3VkZnJvbnQuQ2FjaGVIZWFkZXJCZWhhdmlvci5ub25lKCksXG4gICAgICAgIHF1ZXJ5U3RyaW5nQmVoYXZpb3I6IGNsb3VkZnJvbnQuQ2FjaGVRdWVyeVN0cmluZ0JlaGF2aW9yLm5vbmUoKSxcbiAgICAgICAgY29va2llQmVoYXZpb3I6IGNsb3VkZnJvbnQuQ2FjaGVDb29raWVCZWhhdmlvci5ub25lKCksXG4gICAgICB9XG4gICAgKTtcbiAgICBjb25zdCBwZXJtaXNzaXZlQ2FjaGVQb2xpY3kgPSBuZXcgY2xvdWRmcm9udC5DYWNoZVBvbGljeShcbiAgICAgIHRoaXMsXG4gICAgICBcInBlcm1pc3NpdmVcIixcbiAgICAgIHtcbiAgICAgICAgZGVmYXVsdFR0bDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMCksXG4gICAgICAgIG1pblR0bDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMCksXG4gICAgICAgIG1heFR0bDogY2RrLkR1cmF0aW9uLmRheXMoMzApLFxuICAgICAgICBjb29raWVCZWhhdmlvcjogY2xvdWRmcm9udC5DYWNoZUNvb2tpZUJlaGF2aW9yLmFsbCgpLFxuICAgICAgICBxdWVyeVN0cmluZ0JlaGF2aW9yOiBjbG91ZGZyb250LkNhY2hlUXVlcnlTdHJpbmdCZWhhdmlvci5hbGwoKSxcbiAgICAgICAgaGVhZGVyQmVoYXZpb3I6IGNsb3VkZnJvbnQuQ2FjaGVIZWFkZXJCZWhhdmlvci5hbGxvd0xpc3QoXG4gICAgICAgICAgXCJBdXRob3JpemF0aW9uXCIsXG4gICAgICAgICAgXCJIb3N0XCJcbiAgICAgICAgKSxcbiAgICAgIH1cbiAgICApO1xuICAgIGNvbnN0IGRpc3RyaWJ1dGlvbiA9IG5ldyBjbG91ZGZyb250LkRpc3RyaWJ1dGlvbih0aGlzLCBcInd3d1wiLCB7XG4gICAgICBjZXJ0aWZpY2F0ZSxcbiAgICAgIGRvbWFpbk5hbWVzOiBbZG9tYWluTmFtZV0sXG4gICAgICBwcmljZUNsYXNzOiBjbG91ZGZyb250LlByaWNlQ2xhc3MuUFJJQ0VfQ0xBU1NfQUxMLFxuICAgICAgZGVmYXVsdEJlaGF2aW9yOiB7XG4gICAgICAgIG9yaWdpbjogbmV3IG9yaWdpbnMuUzNPcmlnaW4oc3RhdGljQXNzZXRzKSxcbiAgICAgICAgZWRnZUxhbWJkYXM6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBmdW5jdGlvblZlcnNpb246IGRlZmF1bHRIYW5kbGVyLmN1cnJlbnRWZXJzaW9uLFxuICAgICAgICAgICAgZXZlbnRUeXBlOiBjbG91ZGZyb250LkxhbWJkYUVkZ2VFdmVudFR5cGUuT1JJR0lOX1JFUVVFU1QsXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBmdW5jdGlvblZlcnNpb246IGRlZmF1bHRIYW5kbGVyLmN1cnJlbnRWZXJzaW9uLFxuICAgICAgICAgICAgZXZlbnRUeXBlOiBjbG91ZGZyb250LkxhbWJkYUVkZ2VFdmVudFR5cGUuT1JJR0lOX1JFU1BPTlNFLFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICAgIGFsbG93ZWRNZXRob2RzOiBjbG91ZGZyb250LkFsbG93ZWRNZXRob2RzLkFMTE9XX0FMTCxcbiAgICAgICAgY29tcHJlc3M6IHRydWUsXG4gICAgICAgIGNhY2hlUG9saWN5OiBwZXJtaXNzaXZlQ2FjaGVQb2xpY3ksXG4gICAgICB9LFxuICAgICAgYWRkaXRpb25hbEJlaGF2aW9yczoge1xuICAgICAgICBcIl9uZXh0L3N0YXRpYy8qXCI6IHtcbiAgICAgICAgICBvcmlnaW46IG5ldyBvcmlnaW5zLlMzT3JpZ2luKHN0YXRpY0Fzc2V0cyksXG4gICAgICAgICAgY2FjaGVQb2xpY3k6IGRlZmF1bHRDYWNoZVBvbGljeSxcbiAgICAgICAgfSxcbiAgICAgICAgXCJzdGF0aWMvKlwiOiB7XG4gICAgICAgICAgb3JpZ2luOiBuZXcgb3JpZ2lucy5TM09yaWdpbihzdGF0aWNBc3NldHMpLFxuICAgICAgICAgIGNhY2hlUG9saWN5OiBkZWZhdWx0Q2FjaGVQb2xpY3ksXG4gICAgICAgIH0sXG4gICAgICAgIFwiYXBpLypcIjoge1xuICAgICAgICAgIG9yaWdpbjogbmV3IG9yaWdpbnMuUzNPcmlnaW4oc3RhdGljQXNzZXRzKSxcbiAgICAgICAgICBlZGdlTGFtYmRhczogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBmdW5jdGlvblZlcnNpb246IGFwaUhhbmRsZXIuY3VycmVudFZlcnNpb24sXG4gICAgICAgICAgICAgIGluY2x1ZGVCb2R5OiB0cnVlLFxuICAgICAgICAgICAgICBldmVudFR5cGU6IGNsb3VkZnJvbnQuTGFtYmRhRWRnZUV2ZW50VHlwZS5PUklHSU5fUkVRVUVTVCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgXSxcbiAgICAgICAgICBhbGxvd2VkTWV0aG9kczogY2xvdWRmcm9udC5BbGxvd2VkTWV0aG9kcy5BTExPV19BTEwsXG4gICAgICAgICAgY2FjaGVQb2xpY3k6IHBlcm1pc3NpdmVDYWNoZVBvbGljeSxcbiAgICAgICAgfSxcbiAgICAgICAgXCJfbmV4dC9kYXRhLypcIjoge1xuICAgICAgICAgIG9yaWdpbjogbmV3IG9yaWdpbnMuUzNPcmlnaW4oc3RhdGljQXNzZXRzKSxcbiAgICAgICAgICBlZGdlTGFtYmRhczogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBmdW5jdGlvblZlcnNpb246IGRlZmF1bHRIYW5kbGVyLmN1cnJlbnRWZXJzaW9uLFxuICAgICAgICAgICAgICBldmVudFR5cGU6IGNsb3VkZnJvbnQuTGFtYmRhRWRnZUV2ZW50VHlwZS5PUklHSU5fUkVRVUVTVCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIGZ1bmN0aW9uVmVyc2lvbjogZGVmYXVsdEhhbmRsZXIuY3VycmVudFZlcnNpb24sXG4gICAgICAgICAgICAgIGV2ZW50VHlwZTogY2xvdWRmcm9udC5MYW1iZGFFZGdlRXZlbnRUeXBlLk9SSUdJTl9SRVNQT05TRSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgXSxcbiAgICAgICAgICBjYWNoZVBvbGljeTogbmV3IGNsb3VkZnJvbnQuQ2FjaGVQb2xpY3kodGhpcywgXCJkYXRhXCIsIHtcbiAgICAgICAgICAgIGRlZmF1bHRUdGw6IGNkay5EdXJhdGlvbi5taW51dGVzKDApLFxuICAgICAgICAgICAgbWluVHRsOiBjZGsuRHVyYXRpb24ubWludXRlcygwKSxcbiAgICAgICAgICAgIG1heFR0bDogY2RrLkR1cmF0aW9uLmRheXMoMzApLFxuICAgICAgICAgICAgY29va2llQmVoYXZpb3I6IGNsb3VkZnJvbnQuQ2FjaGVDb29raWVCZWhhdmlvci5hbGwoKSxcbiAgICAgICAgICAgIHF1ZXJ5U3RyaW5nQmVoYXZpb3I6IGNsb3VkZnJvbnQuQ2FjaGVRdWVyeVN0cmluZ0JlaGF2aW9yLmFsbCgpLFxuICAgICAgICAgICAgaGVhZGVyQmVoYXZpb3I6IGNsb3VkZnJvbnQuQ2FjaGVIZWFkZXJCZWhhdmlvci5hbGxvd0xpc3QoXG4gICAgICAgICAgICAgIFwiQXV0aG9yaXphdGlvblwiLFxuICAgICAgICAgICAgICBcIkhvc3RcIlxuICAgICAgICAgICAgKSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgICBhbGxvd2VkTWV0aG9kczogY2xvdWRmcm9udC5BbGxvd2VkTWV0aG9kcy5BTExPV19HRVRfSEVBRCxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBuZXcgcm91dGU1My5BUmVjb3JkKHRoaXMsIFwiaXB2NC1yZWNvcmRcIiwge1xuICAgICAgem9uZTogaG9zdGVkWm9uZSxcbiAgICAgIHJlY29yZE5hbWU6IGRvbWFpbk5hbWUsXG4gICAgICB0YXJnZXQ6IHJvdXRlNTMuUmVjb3JkVGFyZ2V0LmZyb21BbGlhcyhcbiAgICAgICAgbmV3IHRhcmdldHMuQ2xvdWRGcm9udFRhcmdldChkaXN0cmlidXRpb24pXG4gICAgICApLFxuICAgIH0pO1xuICAgIG5ldyByb3V0ZTUzLkFhYWFSZWNvcmQodGhpcywgXCJpcHY2LXJlY29yZFwiLCB7XG4gICAgICB6b25lOiBob3N0ZWRab25lLFxuICAgICAgcmVjb3JkTmFtZTogZG9tYWluTmFtZSxcbiAgICAgIHRhcmdldDogcm91dGU1My5SZWNvcmRUYXJnZXQuZnJvbUFsaWFzKFxuICAgICAgICBuZXcgdGFyZ2V0cy5DbG91ZEZyb250VGFyZ2V0KGRpc3RyaWJ1dGlvbilcbiAgICAgICksXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==