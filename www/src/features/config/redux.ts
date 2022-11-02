import { createSelector, createSlice } from "@reduxjs/toolkit";

interface IState {
  chainId: number;
  chainName: string;
  authMessage: string;
  authTimeout: number;
  nftContractAddress: string;
  nftEnumeratorContractAddress: string;
}
const oneWeekMs = 60 * 60 * 24 * 7 * 1000;
const initialState: IState = {
  chainId: Number(process.env.CHAIN_ID) ?? 0,
  chainName: process.env.CHAIN ?? "",
  authMessage: process.env.WEB3_AUTH_MESSAGE ?? "",
  authTimeout: Number(process.env.WEB3_AUTH_TIMEOUT) ?? oneWeekMs,
  nftContractAddress: process.env.NFT_CONTRACT_ADDRESS ?? "",
  nftEnumeratorContractAddress:
    process.env.NFT_ENUMERATOR_CONTRACT_ADDRESS ?? "",
};
const slice = createSlice({
  name: "config",
  initialState,
  reducers: {},
});

const root = (state: any): IState => state.config;
const selectChainId = createSelector(root, (state) => state.chainId);
const selectChainName = createSelector(root, (state) => state.chainName);
const selectAuthMessage = createSelector(root, (state) => state.authMessage);
const selectAuthTimeout = createSelector(root, (state) => state.authTimeout);
const selectNftContractAddress = createSelector(
  root,
  (state) => state.nftContractAddress
);
const selectNftEnumeratorContractAddress = createSelector(
  root,
  (state) => state.nftEnumeratorContractAddress
);
export const selectors = {
  chainId: selectChainId,
  chainName: selectChainName,
  authMessage: selectAuthMessage,
  authTimeout: selectAuthTimeout,
  nftContractAddress: selectNftContractAddress,
  nftEnumeratorContractAddress: selectNftEnumeratorContractAddress,
};
export const { reducer } = slice;
