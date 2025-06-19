import { createThirdwebClient } from "thirdweb";
import config from "../config";

const { thirdwebClientId } = config;

if (!thirdwebClientId) {
  throw new Error("No client ID provided");
}

export const THIRDWEB_CLIENT = createThirdwebClient({
  clientId: thirdwebClientId,
});
