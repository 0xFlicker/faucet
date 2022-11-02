#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { FaucetStack } from "./stack";

const app = new cdk.App();
new FaucetStack(app, `faucet`, {
  domain: ["faucet", "0xflick.xyz"],
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: "us-east-1",
  },
});
