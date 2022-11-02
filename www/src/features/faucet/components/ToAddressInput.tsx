import { TextField } from "@mui/material";
import { useAppDispatch } from "app/store";
import { FC, useCallback, useState } from "react";
import { utils } from "ethers";
import { recaptchaSlice } from "../recaptcha";

export const ToAddressInput: FC = () => {
  const dispatch = useAppDispatch();
  const [isBad, setIsBad] = useState(false);
  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!utils.isAddress(e.target.value)) {
        dispatch(recaptchaSlice.actions.to(""));
        return setIsBad(true);
      }
      setIsBad(false);
      dispatch(recaptchaSlice.actions.to(e.target.value));
    },
    [dispatch]
  );
  return (
    <TextField
      label="To Address"
      required
      fullWidth
      error={isBad}
      variant="outlined"
      onChange={onChange}
    />
  );
};
