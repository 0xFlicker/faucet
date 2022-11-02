import { FC } from "react";
import { Container, Box, Typography } from "@mui/material";
import { ContentCopyRounded as CopyIcon } from "@mui/icons-material";
import { CopyToClipboardButton } from "./CopyToClipboard";
import { AddRpc } from "./AddRpc";
import { Follow } from "./Follow";

export const Footer: FC = () => {
  return (
    <Container>
      <Box display="flex" minHeight="100vh" flexDirection="column">
        <Box
          sx={{
            px: 4,
            py: 4,
            bg: "background",
            color: "text",
            borderTop: "1px solid",
            borderColor: "border",
            textAlign: "center",
          }}
        >
          <Follow />
          <Typography variant="body1" mt="8px">
            If you find this faucet useful, please consider donating some
            homestead ether to
            <CopyToClipboardButton
              icon={<CopyIcon />}
              text="0xa08ea173f778e4a264d3308385E6F046E691BbA7"
            >
              0xflick.eth
            </CopyToClipboardButton>
          </Typography>
          <Typography variant="body1">
            Need a sepolia testnet RPC? Here is a free one
            <AddRpc />
          </Typography>
          <Typography variant="body1" mt="8px">
            IP address hashed anonymously and stored temporarily to rate limit
            per IP, otherwise no user tracking
          </Typography>
        </Box>
      </Box>
    </Container>
  );
};
