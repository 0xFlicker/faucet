import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export const recaptchaSlice = createSlice({
  name: "recaptcha",
  initialState: {
    token: "",
    to: "",
    txHash: "",
  },
  reducers: {
    to: (state, action: PayloadAction<string>) => {
      state.to = action.payload;
    },
    token: (state, action: PayloadAction<string>) => {
      state.token = action.payload;
    },
    txHash: (state, action: PayloadAction<string>) => {
      state.txHash = action.payload;
    },
  },
});
