/**
 * Empty stub for starkzap's optional peer dependencies that we don't use.
 * Aliased in next.config.mjs so the bundler can resolve unused imports
 * (Tongo confidential transfers, Hyperlane Solana bridge) without us
 * pulling those packages into the dependency tree.
 *
 * If a code path ever actually loads from this shim, it will throw at
 * the call site — which is intentional: it tells us a starkzap feature
 * we haven't enabled is being invoked.
 */
const handler: ProxyHandler<object> = {
  get(_target, prop) {
    throw new Error(
      `starkzap optional peer dependency accessed via shim: ${String(prop)}. ` +
        `If you need this feature, install the corresponding peer package and remove the alias from next.config.mjs.`,
    );
  },
};

const shim = new Proxy({}, handler);

export default shim;
export const Account = shim;
