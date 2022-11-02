import { useAppDispatch, useAppSelector } from "app/store";
import { FC, useRef, useCallback, useEffect } from "react";
import ReCAPTCHA from "react-google-recaptcha";
import { recaptchaSlice } from "../recaptcha";

export const ReCaptcha: FC = () => {
  const dispatch = useAppDispatch();
  const txHash = useAppSelector((state) => state.recaptcha.txHash);

  const recaptchaRef = useRef<ReCAPTCHA>(null);
  useEffect(() => {
    if (recaptchaRef.current) {
      recaptchaRef.current.reset();
    }
  }, [txHash]);

  const onReCAPTCHAChange = useCallback(
    (value: string | null) => {
      if (value) {
        return dispatch(recaptchaSlice.actions.token(value));
      }
      recaptchaRef.current?.reset();
    },
    [dispatch]
  );

  return (
    <ReCAPTCHA
      ref={recaptchaRef}
      size="normal"
      sitekey={process.env.NEXT_PUBLIC_RECAPTCHA_SITE ?? ""}
      onChange={onReCAPTCHAChange}
    />
  );
};
