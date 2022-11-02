import { Builder } from "@sls-next/lambda-at-edge";
const builder = new Builder(".", ".build", { args: ["build"] });
builder.build().catch((e) => {
  console.log(e);
  process.exit(1);
});
