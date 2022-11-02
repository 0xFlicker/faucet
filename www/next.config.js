
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    VALUE: process.env.VALUE,
    NEXT_PUBLIC_VALUE: `${process.env.VALUE} SEP`,
    NEXT_PUBLIC_CHAIN: process.env.NEXT_PUBLIC_CHAIN,
    NEXT_PUBLIC_CHAIN_ID: process.env.RPC_CHAIN_ID,
    CHAIN_ID: process.env.RPC_CHAIN_ID,
    RPC: process.env.RPC_URL,
    NEXT_PUBLIC_RPC: process.env.RPC_URL,
    NEXT_PUBLIC_BLOCK_EXPLORER: process.env.BLOCK_EXPLORER_URL,
    PRIVATE_KEY: process.env.PRIVATE_KEY,
    NEXT_PUBLIC_RECAPTCHA_SITE: process.env.NEXT_PUBLIC_RECAPTCHA_SITE,
    RECAPTCHA_SECRET: process.env.RECAPTCHA_SECRET,
  },
}

module.exports = nextConfig
