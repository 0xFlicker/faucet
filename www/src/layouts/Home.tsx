import { FC } from "react";
import {
  AppBar,
  Toolbar,
  Typography,
  Container,
  Paper,
  Box,
} from "@mui/material";
import { useLocale } from "locales/hooks";
import { ReCaptcha } from "features/faucet/components/ReCaptcha";
import { Drink } from "features/faucet/components/Drink";
import { ToAddressInput } from "features/faucet/components/ToAddressInput";
import { Footer } from "components/Footer";
import { ContentCopyRounded as CopyIcon } from "@mui/icons-material";
import { CopyToClipboardButton } from "components/CopyToClipboard";

const Home: FC = () => {
  const { t } = useLocale("common");
  return (
    <>
      <AppBar position="absolute" color="default">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Sepolia faucet
          </Typography>
        </Toolbar>
      </AppBar>
      <Toolbar />
      <main>
        <Container>
          <Paper>
            <Box display="flex" justifyContent="center" sx={{ pt: 4, mx: 4 }}>
              <Typography variant="h5" sx={{ pt: 4 }}>
                Free faucet
              </Typography>
            </Box>
            <Box display="flex" justifyContent="center" sx={{ pt: 4, mx: 4 }}>
              <Typography component="p" sx={{ pt: 4 }}>
                Formly very generous but now not so much due to 0 donations and
                vast majority seemingly heading into faucet draining wallets.
                Sorry but the party is over. Please consider donating to the
                project if you like it. In particular I could really use
                financial help running the Sepolia RPC. Thank you.
              </Typography>
            </Box>

            <Box display="flex" justifyContent="center" sx={{ pt: 2 }}>
              <Typography variant="body1" component="p">
                Faucet donations
              </Typography>
            </Box>
            <Box display="flex" justifyContent="center">
              <CopyToClipboardButton
                icon={<CopyIcon />}
                text="0x16e05bB826aDfABf8d38Bbf16ef9CB0061f35679"
              >
                0x16e05bB826aDfABf8d38Bbf16ef9CB0061f35679
              </CopyToClipboardButton>
            </Box>
            <Box display="flex" justifyContent="center">
              <Typography variant="body1" component="p" sx={{ pb: 4 }}>
                Provides {process.env.NEXT_PUBLIC_VALUE} for free every ~24
                hours.
              </Typography>
            </Box>

            <Box display="flex" justifyContent="center">
              <ReCaptcha />
            </Box>
            <Box
              display="flex"
              justifyContent="center"
              sx={{ py: 2, px: 8, m: "auto" }}
            >
              <ToAddressInput />
            </Box>
            <Box display="flex" justifyContent="center" sx={{ pb: 4 }}>
              <Drink />
            </Box>
            <Box display="flex" justifyContent="center" sx={{ mx: 4 }}>
              <Typography component="p" sx={{ pt: 4 }}>
                If you need more SEP than this faucet provides, drop me a DM on
                Twitter with what you are building and I'll send you what you
                need.
              </Typography>
            </Box>
          </Paper>
        </Container>
      </main>
      <Footer />
    </>
  );
};

export default Home;
