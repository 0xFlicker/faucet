import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

export interface FaucetResponse {
  error?: string;
  txHash?: string;
  remainingTime: number;
  remainingCount?: number;
}

export const faucetApi = createApi({
  reducerPath: "faucet",
  baseQuery: fetchBaseQuery({ baseUrl: `/api/` }),
  endpoints: (builder) => ({
    drinkFromFaucet: builder.mutation<
      FaucetResponse,
      { to: string; token: string }
    >({
      query: ({ to, token }) => ({
        url: process.env.NEXT_PUBLIC_CHAIN ?? "",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ to, token }),
      }),
    }),
  }),
});

export const { useDrinkFromFaucetMutation } = faucetApi;
