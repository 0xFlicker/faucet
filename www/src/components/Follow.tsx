import { FC, useEffect } from "react";
import Head from "next/head";

export const Follow: FC = () => {
  // useEffect(() => {
  //   const script = document.createElement("script");
  //   script.src = "https://platform.twitter.com/widgets.js";
  //   document.body.appendChild(script);
  // }, []);

  return (
    <>
      <Head>
        <script async src="https://platform.twitter.com/widgets.js" />
      </Head>
      <a
        href="https://twitter.com/0xflick?ref_src=twsrc%5Etfw"
        className="twitter-follow-button"
        data-show-count="false"
      >
        Follow @0xflick
      </a>
    </>
  );
};
