// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import AWS from "aws-sdk";
import axios from "axios";
import { DrinkerDAO } from "db/drinker";
import { providers, Wallet, utils } from "ethers";
import { getDb } from "db/dynamodb";

type Data = {
  txHash?: string;
  remainingTime?: number;
  remainingCount?: number;
  rateLimited?: number;
  error?: string;
};

if (!process.env.PRIVATE_KEY) {
  console.error("PRIVATE_KEY not set");
  process.exit(1);
}
if (!process.env.RPC_URL) {
  console.error("RPC_URL not set");
  process.exit(1);
}
if (!process.env.VALUE) {
  console.error("VALUE not set");
  process.exit(1);
}
const provider = new providers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new Wallet(process.env.PRIVATE_KEY, provider);
const value = utils.parseEther(process.env.VALUE);
const drinkerDao = new DrinkerDAO(getDb());
const ssm = new AWS.SSM({
  region: "us-east-1",
});

const promiseTableName = ssm
  .getParameter({ Name: "Sepolia_DrinkerTableName" })
  .promise();
promiseTableName.then((result) => {
  console.log(`TableName: ${result.Parameter?.Value}`);
  DrinkerDAO.TABLE_NAME = result.Parameter?.Value ?? DrinkerDAO.TABLE_NAME;
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  await promiseTableName;
  try {
    let remainingCount = 0;
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    console.log(`Check if to: ${body.to} is alcoholic`);
    let drinker = await drinkerDao.isAlcoholic(body.to);
    if (drinker) {
      console.log(drinker.toString());
      console.log(`${body.to} is alcoholic with ${remainingCount} remaining`);
      return res
        .status(400)
        .json({ remainingTime: drinker.ttl - Math.floor(Date.now() / 1000) });
    } else {
      await drinkerDao.brew({ key: body.to, remainingCount: 0 });
    }
    const ipHeader = req.headers["x-real-ip"] || req.headers["x-forwarded-for"];
    const ip = Array.isArray(ipHeader) ? ipHeader[0] : ipHeader || "anonymous";
    const hashIp = utils.solidityKeccak256(["string"], [ip]);
    console.log(`Check if IP ${hashIp} is alcoholic`);
    drinker = await drinkerDao.isAlcoholic(hashIp);
    if (drinker && drinker.remainingCount < 1) {
      console.log(drinker.toString());
      remainingCount = drinker.remainingCount ?? 1;
      console.log(`${hashIp} is alcoholic with ${remainingCount} remaining`);
      return res
        .status(400)
        .json({ remainingTime: drinker.ttl - Math.floor(Date.now() / 1000) });
    } else if (drinker) {
      remainingCount = drinker.remainingCount ?? 1;
      console.log(
        `${hashIp} is not yet alcoholic with ${remainingCount} remaining`
      );
    } else {
      remainingCount = 1;
      await drinkerDao.brew({ key: hashIp, remainingCount });
    }

    console.log(`Checking recaptcha ${JSON.stringify(body)}`);
    const response = await axios.post(
      "https://www.google.com/recaptcha/api/siteverify",
      {
        secret: process.env.RECAPTCHA_SECRET,
        response: body.token,
        remoteip: req.headers["x-real-ip"] || req.headers["x-forwarded-for"],
      },
      {
        params: {
          secret: process.env.RECAPTCHA_SECRET,
          response: body.token,
          remoteip: req.headers["x-real-ip"] || req.headers["x-forwarded-for"],
        },
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
        },
      }
    );
    if (!response.data.success) {
      console.error(
        `Recaptcha failed ${JSON.stringify(response.data?.["error-codes"])}`
      );
      res.status(400).json({ error: "reCAPTCHA failed" });
      return;
    }
    console.log(`Sending ${value} to ${body.to}`);
    const tx = await wallet.sendTransaction({
      to: body.to,
      value,
      data: utils.toUtf8Bytes("Thanks for using 0xflick's faucet!"),
    });
    console.log(
      `Sent ${value} to ${body.to} txHash: ${tx.hash} and remainingCount: ${remainingCount}`
    );
    await drinkerDao.drank({
      key: body.to,
    });
    await drinkerDao.drank({
      key: hashIp,
    });
    res
      .status(200)
      .json({ txHash: tx.hash, remainingCount: remainingCount - 1 });
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: "reCAPTCHA failed" });
    return;
  }
}
