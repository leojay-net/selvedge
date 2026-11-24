import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { address, createSolanaRpc } from "@solana/kit";
import {
  DEVNET_RPC_URL,
  TOKEN_PROGRAM_ADDRESS,
  TransactionFailedError,
  approveMandateDelegateInstruction,
  createMandateInstruction,
  decodeMandateAccount,
  deriveMandateAddress,
  revokeMandateInstruction,
  sendAndConfirm,
  spendInstruction,
} from "@selvedge/sdk";
import { loadKeyPairSigner } from "../src/keys.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const deployment = JSON.parse(readFileSync(join(repositoryRoot, "docs/devnet-deployment.json"), "utf8")) as Record<string, string>;
const STUDIO_TOOL_ID = 1n;
const UNLISTED_TOOL_ID = 99n;
const PERIOD_CAP = 5_000_000n;
const SECONDS_PER_DAY = 86_400n;
const MANDATE_LIFETIME_DAYS = 7n;
const FIRST_SPEND = 2_000_000n;
const OVER_CAP_SPEND = 4_000_000n;
const SMALL_SPEND = 1_000_000n;

interface ScenarioRecord {
  readonly scenario: string;
  readonly outcome: "succeeded" | "refused";
  readonly signature: string | null;
  readonly detail: string;
}

async function main(): Promise<void> {
  const rpc = createSolanaRpc(deployment.rpcUrl ?? DEVNET_RPC_URL);
  const owner = await loadKeyPairSigner(process.env.SELVEDGE_OWNER_KEYPAIR_PATH ?? join(homedir(), ".config/solana/id.json"));
  const agent = await loadKeyPairSigner(join(repositoryRoot, "keys/agent.json"));
  const security = await loadKeyPairSigner(join(repositoryRoot, "keys/security.json"));
  const mint = deployment.testStablecoinMint ?? "";
  const ownerTokenAccount = deployment.ownerTokenAccount ?? "";
  const merchantTokenAccount = deployment.merchantTokenAccount ?? "";
  const merchant = deployment.merchant ?? "";
  const mandateId = BigInt(Math.floor(Date.now() / 1000));
  const mandateAddress = await deriveMandateAddress(owner.address, mandateId);
  const records: ScenarioRecord[] = [];
  const now = BigInt(Math.floor(Date.now() / 1000));

  const createSignature = await sendAndConfirm({
    rpc,
    feePayer: owner,
    instructions: [
      createMandateInstruction({
        ownerAddress: owner.address,
        mandateAddress,
        mandateId,
        agentAddress: agent.address,
        securityAuthorityAddress: security.address,
        mintAddress: mint,
        limits: {
          periodCap: PERIOD_CAP,
          periodSeconds: SECONDS_PER_DAY,
          expiry: now + MANDATE_LIFETIME_DAYS * SECONDS_PER_DAY,
          allowedPrograms: [TOKEN_PROGRAM_ADDRESS],
          allowedPayees: [merchant],
          allowedTools: [STUDIO_TOOL_ID],
        },
      }),
      approveMandateDelegateInstruction(ownerTokenAccount, mandateAddress, owner.address, PERIOD_CAP * 3n),
    ],
  });
  records.push({ scenario: "create mandate and delegate tokens", outcome: "succeeded", signature: createSignature, detail: `mandate ${mandateAddress}` });

  async function spendAttempt(label: string, amount: bigint, toolId: bigint, nonce: bigint, signer = agent): Promise<void> {
    try {
      const signature = await sendAndConfirm({
        rpc,
        feePayer: signer,
        skipPreflight: true,
        instructions: [
          spendInstruction({
            agentAddress: signer.address,
            mandateAddress,
            mintAddress: mint,
            ownerTokenAccount,
            payeeTokenAccount: merchantTokenAccount,
            amount,
            toolId,
            expectedNonce: nonce,
          }),
        ],
      });
      records.push({ scenario: label, outcome: "succeeded", signature, detail: `${amount} units to merchant` });
    } catch (caught) {
      if (!(caught instanceof TransactionFailedError)) throw caught;
      records.push({
        scenario: label,
        outcome: "refused",
        signature: caught.signature,
        detail: caught.mandateErrorName ?? caught.message,
      });
    }
  }

  await spendAttempt("spend within cap", FIRST_SPEND, STUDIO_TOOL_ID, 0n);
  await spendAttempt("spend that would exceed the period cap", OVER_CAP_SPEND, STUDIO_TOOL_ID, 1n);
  await spendAttempt("spend with a tool outside the allowlist", SMALL_SPEND, UNLISTED_TOOL_ID, 1n);
  await spendAttempt("replay of the first spend nonce", FIRST_SPEND, STUDIO_TOOL_ID, 0n);

  const revokeSignature = await sendAndConfirm({
    rpc,
    feePayer: security,
    instructions: [revokeMandateInstruction(security.address, mandateAddress)],
  });
  records.push({ scenario: "security authority revokes the mandate", outcome: "succeeded", signature: revokeSignature, detail: "revoked_by security authority key" });
  await spendAttempt("spend after revocation", SMALL_SPEND, STUDIO_TOOL_ID, 1n);

  const accountResult = await rpc.getAccountInfo(address(mandateAddress), { encoding: "base64" }).send();
  const accountBytes = Buffer.from((accountResult.value?.data as unknown as [string, string])[0], "base64");
  const finalState = decodeMandateAccount(mandateAddress, new Uint8Array(accountBytes));
  const output = {
    generatedAt: new Date().toISOString(),
    mandate: mandateAddress,
    finalState: {
      spentInPeriod: finalState.spentInPeriod.toString(),
      nonce: finalState.nonce.toString(),
      revoked: finalState.revoked,
      periodCap: finalState.periodCap.toString(),
    },
    records,
  };
  const outputPath = join(repositoryRoot, "docs/devnet-scenarios.json");
  const history = existsSync(outputPath) ? (JSON.parse(readFileSync(outputPath, "utf8")) as { runs?: unknown[] }).runs ?? [] : [];
  writeFileSync(outputPath, `${JSON.stringify({ runs: [...history, output] }, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main().catch((caught: unknown) => {
  process.stderr.write(`${caught instanceof Error ? caught.stack : String(caught)}\n`);
  process.exit(1);
});
