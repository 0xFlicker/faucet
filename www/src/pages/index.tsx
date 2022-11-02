import type { NextPage, GetStaticProps } from "next";

import Head from "next/head";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import i18next, { TFunction, InitOptions } from "i18next";
import { store } from "app/store";
import { Provider } from "react-redux";
import dark from "themes/dark";
import Home from "layouts/Home";
import { Provider as LocaleProvider } from "locales/hooks";
import common from "locales/en/common.json";

export const getStaticProps: GetStaticProps = async () => {
  return {
    props: {
      i18n: {
        lng: "en",
        ns: ["common"],
        defaultNS: "common",
        resources: {
          en: {
            common,
          },
        },
      },
    },
  };
};

const HomePage: NextPage<{ i18n: InitOptions }> = ({ i18n }) => {
  return (
    <LocaleProvider i18n={i18n}>
      <Provider store={store}>
        <ThemeProvider theme={dark}>
          <Head>
            <title>Sepolia faucet</title>
            <meta
              name="description"
              content="Sepolia faucet provided by 0xflick.eth"
            />
            <link rel="icon" href="/favicon.ico" />
          </Head>
          <CssBaseline />
          <Home />
        </ThemeProvider>
      </Provider>
    </LocaleProvider>
  );
};

export default HomePage;
