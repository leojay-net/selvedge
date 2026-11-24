import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AccountRole,
  address,
  createSolanaRpc,
  getAddressEncoder,
  type Address,
  type KeyPairSigner,
  type Instruction,
} from "@solana/kit";
import {
  DEVNET_RPC_URL,
  SYSTEM_PROGRAM_ADDRESS,
  TOKEN_PROGRAM_ADDRESS,
  createAssociatedTokenAccountIdempotentInstruction,
  deriveAssociatedTokenAddress,
  sendAndConfirm,
} from "@selvedge/sdk";
import { loadKeyPairSigner } from "../src/keys.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const keysDirectory = join(repositoryRoot, "keys");
const TEST_MINT_DECIMALS = 6;
const MINT_ACCOUNT_BYTES = 82n;
const MINT_ACCOUNT_RENT_LAMPORTS = 1_461_600n;
const FACILITATOR_FUNDING_LAMPORTS = 60_000_000n;
const SECURITY_FUNDING_LAMPORTS = 20_000_000n;
const AGENT_FUNDING_LAMPORTS = 20_000_000n;
const OWNER_STARTING_TOKENS = 1_000_000_000n;
const INITIALIZE_MINT2_CODE = 20;
const MINT_TO_CODE = 7;
const SYSTEM_TRANSFER_CODE = 2;
const SYSTEM_CREATE_ACCOUNT_CODE = 0;

function littleEndian(value: bigint, byteLength: number): number[] {
  const bytes: number[] = [];
  let remaining = value;
  for (let byteIndex = 0; byteIndex < byteLength; byteIndex += 1) {
    bytes.push(Number(remaining & 0xffn));
    remaining >>= 8n;
  }
  return bytes;
}

const addressEncoder = getAddressEncoder();

function transferLamports(from: Address, to: Address, lamports: bigint): Instruction {
  return {
    programAddress: address(SYSTEM_PROGRAM_ADDRESS),
    accounts: [
      { address: from, role: AccountRole.WRITABLE_SIGNER },
      { address: to, role: AccountRole.WRITABLE },
    ],
    data: Uint8Array.from([...littleEndian(BigInt(SYSTEM_TRANSFER_CODE), 4), ...littleEndian(lamports, 8)]),
  };
}

function createMintAccount(payer: Address, mintSigner: KeyPairSigner): Instruction {
  return {
    programAddress: address(SYSTEM_PROGRAM_ADDRESS),
    accounts: [
      { address: payer, role: AccountRole.WRITABLE_SIGNER },
      { address: mintSigner.address, role: AccountRole.WRITABLE_SIGNER, signer: mintSigner },
    ],
    data: Uint8Array.from([
      ...littleEndian(BigInt(SYSTEM_CREATE_ACCOUNT_CODE), 4),
      ...littleEndian(MINT_ACCOUNT_RENT_LAMPORTS, 8),
      ...littleEndian(MINT_ACCOUNT_BYTES, 8),
      ...addressEncoder.encode(address(TOKEN_PROGRAM_ADDRESS)),
    ]),
  };
}

function initializeMint(mint: Address, authority: Address): Instruction {
  return {
    programAddress: address(TOKEN_PROGRAM_ADDRESS),
    accounts: [{ address: mint, role: AccountRole.WRITABLE }],
    data: Uint8Array.from([INITIALIZE_MINT2_CODE, TEST_MINT_DECIMALS, ...addressEncoder.encode(authority), 0]),
  };
}

function mintTo(mint: Address, destination: string, authority: Address, amount: bigint): Instruction {
  return {
    programAddress: address(TOKEN_PROGRAM_ADDRESS),
    accounts: [
      { address: mint, role: AccountRole.WRITABLE },
      { address: address(destination), role: AccountRole.WRITABLE },
      { address: authority, role: AccountRole.READONLY_SIGNER },
    ],
    data: Uint8Array.from([MINT_TO_CODE, ...littleEndian(amount, 8)]),
  };
}

function ensureKeyFile(name: string): string {
  const keyFilePath = join(keysDirectory, `${name}.json`);
  if (!existsSync(keyFilePath)) {
    execFileSync("solana-keygen", ["new", "--no-bip39-passphrase", "-s", "-o", keyFilePath], { stdio: "ignore" });
  }
  return keyFilePath;
}

async function main(): Promise<void> {
  mkdirSync(keysDirectory, { recursive: true });
  const rpc = createSolanaRpc(process.env.SOLANA_RPC_URL ?? DEVNET_RPC_URL);
  const ownerKeyPath = process.env.SELVEDGE_OWNER_KEYPAIR_PATH ?? join(homedir(), ".config/solana/id.json");
  const owner = await loadKeyPairSigner(ownerKeyPath);
  const agent = await loadKeyPairSigner(ensureKeyFile("agent"));
  const security = await loadKeyPairSigner(ensureKeyFile("security"));
  const merchant = await loadKeyPairSigner(ensureKeyFile("merchant"));
  const facilitator = await loadKeyPairSigner(ensureKeyFile("facilitator"));

  const mintKeyFileExisted = existsSync(join(keysDirectory, "test-usdc-mint.json"));
  const mintSigner = await loadKeyPairSigner(ensureKeyFile("test-usdc-mint"));
  const mintAddress = mintSigner.address;
  if (!mintKeyFileExisted) {
    await sendAndConfirm({
      rpc,
      feePayer: owner,
      instructions: [createMintAccount(owner.address, mintSigner), initializeMint(mintAddress, owner.address)],
    });
  }

  const ownerTokenAccount = await deriveAssociatedTokenAddress(owner.address, mintAddress);
  const merchantTokenAccount = await deriveAssociatedTokenAddress(merchant.address, mintAddress);
  await sendAndConfirm({
    rpc,
    feePayer: owner,
    instructions: [
      transferLamports(owner.address, facilitator.address, FACILITATOR_FUNDING_LAMPORTS),
      transferLamports(owner.address, security.address, SECURITY_FUNDING_LAMPORTS),
      transferLamports(owner.address, agent.address, AGENT_FUNDING_LAMPORTS),
      createAssociatedTokenAccountIdempotentInstruction(owner.address, ownerTokenAccount, owner.address, mintAddress),
      createAssociatedTokenAccountIdempotentInstruction(owner.address, merchantTokenAccount, merchant.address, mintAddress),
      mintTo(mintAddress, ownerTokenAccount, owner.address, OWNER_STARTING_TOKENS),
    ],
  });

  const deployment = {
    network: "solana-devnet",
    rpcUrl: DEVNET_RPC_URL,
    mandateProgram: "DDorK5hW2iufBzDi3mmpuiFW2mZT57jGFE2jewmp7pxd",
    testStablecoinMint: mintAddress,
    owner: owner.address,
    agent: agent.address,
    securityAuthority: security.address,
    merchant: merchant.address,
    facilitatorFeePayer: facilitator.address,
    ownerTokenAccount,
    merchantTokenAccount,
  };
  const deploymentPath = join(repositoryRoot, "docs", "devnet-deployment.json");
  writeFileSync(deploymentPath, `${JSON.stringify(deployment, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(deployment, null, 2)}\n`);
}

main().catch((caught: unknown) => {
  process.stderr.write(`${caught instanceof Error ? caught.stack : String(caught)}\n`);
  process.exit(1);
});
