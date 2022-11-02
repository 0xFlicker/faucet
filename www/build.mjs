#!/usr/bin/env node
import "source-map-support/register.js";
import pkg from '@sls-next/lambda-at-edge';
const { Builder } = pkg;

const builder = new Builder(
  ".",
  "../.build",
  {
    args: ["build"],
  }
);
builder
  .build()
  .then(() => {
    console.log("Build complete");
  })
  .catch((e) => {
    console.log(e);
    process.exit(1);
  });
