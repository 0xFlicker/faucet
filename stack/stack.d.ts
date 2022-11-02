import * as cdk from "aws-cdk-lib";
export interface DiscordProps extends cdk.StackProps {
    readonly domain: [string, string] | string;
}
export declare class FaucetStack extends cdk.Stack {
    constructor(scope: cdk.App, id: string, props: DiscordProps);
}
