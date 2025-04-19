import { createThirdwebClient } from "thirdweb";
import config from "./config";

export const client = createThirdwebClient({
  clientId: config.thirdwebClientId,
});
