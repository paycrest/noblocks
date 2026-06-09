/**
 * Bundler/upgrade contract config (ported from upgrade-server).
 * Used for UserOp generation, Nexus upgrade, and EntryPoint.
 */
export const versionConfig = {
  implementationAddress: '0x00000000383e8cBe298514674Ea60Ee1d1de50ac' as const,
  bootStrapAddress: '0x0000003eDf18913c01cBc482C978bBD3D6E8ffA3' as const,
};

export const deployFactoryConfig = {
  factoryAddress: '0x000000a56aaca3e9a4c479ea6b6cd0dbcb6634f5' as const,
  moduleSetupContract: '0x0000001c5b32F37F5beA87BDD5374eB2aC54eA8e' as const,
};

export const ENTRY_POINT_ADDRESS = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789' as const;

export const GAS_CONFIG = {
  callGasLimit: BigInt(80000),
  verificationGasLimit: BigInt(100000),
  preVerificationGas: BigInt(70000),
  maxFeePerGas: BigInt(5000000),
  maxPriorityFeePerGas: BigInt(500000),
} as const;
