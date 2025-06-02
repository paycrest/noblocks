import { createThirdwebClient } from "thirdweb";
import config from "../config";

const { thirdwebClientId } = config;

export const THIRDWEB_CLIENT = createThirdwebClient({
  clientId: thirdwebClientId,
});
