/**
 * TreasuryService.ts
 *
 * A robust client-side service for 1:1 USDC ↔ pUSDC conversion, fully collateralized by on-chain USDC treasury reserves.
 * Features:
 *  - Deterministic conversion with decimal invariants to prevent peg drift.
 *  - On-demand invariant checks comparing pUSDC mint supply to USDC reserves.
 *  - Atomic transaction builders returning both Transaction and required signers.
 *  - Async, error-wrapped file operations for keypair management.
 *  - Explicit fee payer and blockhash injection.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  BlockhashWithExpiryBlockHeight,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getMint,
  createTransferInstruction,
  createMintToInstruction,
  createBurnInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * Constants for USDC and pUSDC
 */
export const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
export const PUSDC_MINT = new PublicKey('AhYwvKyAZYQeb9fZ1GMqt9PqWo1msdCsMtBFfHvnHKh');
export const USDC_DECIMALS = 6;
export const PUSDC_DECIMALS = 9;
const DECIMAL_MULTIPLIER = 10 ** (PUSDC_DECIMALS - USDC_DECIMALS);

const TREASURY_KEYPAIR_PATH = path.resolve(__dirname, '../../keypairs/treasury.json');

/**
 * Load existing or generate new keypair for the treasury authority.
 * Ensures the keypair directory exists and surfaces IO errors.
 */
async function loadOrGenerateTreasuryKeypair(): Promise<Keypair> {
  try {
    await fs.mkdir(path.dirname(TREASURY_KEYPAIR_PATH), { recursive: true });
    const exists = await fs.stat(TREASURY_KEYPAIR_PATH).then(() => true).catch(() => false);
    if (exists) {
      const secret = JSON.parse(await fs.readFile(TREASURY_KEYPAIR_PATH, 'utf-8')) as number[];
      return Keypair.fromSecretKey(Uint8Array.from(secret));
    }
    const kp = Keypair.generate();
    await fs.writeFile(TREASURY_KEYPAIR_PATH, JSON.stringify(Array.from(kp.secretKey)));
    return kp;
  } catch (err) {
    throw new Error(`Failed loading treasury keypair: ${(err as Error).message}`);
  }
}

/**
 * Ensure an associated token account exists for a given mint and owner.
 * Returns the ATA public key.
 */
async function getOrCreateATA(
  connection: Connection,
  mint: PublicKey,
  owner: PublicKey,
  payer: Keypair
): Promise<PublicKey> {
  const ata = await getAssociatedTokenAddress(mint, owner);
  const info = await connection.getAccountInfo(ata);
  if (info) return ata;

  const ix = createAssociatedTokenAccountInstruction(
    payer.publicKey,
    ata,
    owner,
    mint,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const { blockhash, lastValidBlockHeight }: BlockhashWithExpiryBlockHeight =
    await connection.getLatestBlockhash();

  const tx = new Transaction({
    feePayer: payer.publicKey,
    blockhash,
    lastValidBlockHeight,
  }).add(ix);

  await sendAndConfirmTransaction(connection, tx, [payer]);
  return ata;
}

/**
 * Convert UI amount to atomic units, enforcing integer representation.
 */
function toAtomic(amount: number, decimals: number): bigint {
  const units = amount * 10 ** decimals;
  if (!Number.isInteger(units) || units < 0) {
    throw new Error(`Invalid amount ${amount} for decimals ${decimals}`);
  }
  return BigInt(units);
}

/**
 * TreasuryService handles treasury setup and deposit/withdrawal logic.
 */
export class TreasuryService {
  private treasuryKeypair!: Keypair;
  public treasuryAuthority!: PublicKey;
  private treasuryUSDC!: PublicKey;

  constructor(private connection: Connection) {}

  /**
   * Initialize treasury authority and USDC account, then verify peg invariant.
   */
  public async init(): Promise<void> {
    this.treasuryKeypair = await loadOrGenerateTreasuryKeypair();
    this.treasuryAuthority = this.treasuryKeypair.publicKey;
    this.treasuryUSDC = await getOrCreateATA(
      this.connection,
      USDC_MINT,
      this.treasuryAuthority,
      this.treasuryKeypair
    );

    // Verify initial invariant
    if (!(await this.checkPegInvariant())) {
      console.warn('Warning: pUSDC supply does not match collateral reserves at init');
    }
  }

  /**
   * Build a transaction to deposit USDC and mint pUSDC one-to-one.
   * Returns the transaction along with signers required.
   */
  public async buildDepositTx(
    user: PublicKey,
    uiAmount: number
  ): Promise<{ tx: Transaction; signers: Keypair[] }> {
    if (uiAmount <= 0) throw new Error('Deposit amount must be positive');

    const usdcUnits = toAtomic(uiAmount, USDC_DECIMALS);
    const pusdcUnits = usdcUnits * BigInt(DECIMAL_MULTIPLIER);

    // Fetch balances
    const userUSDCATA = await getOrCreateATA(this.connection, USDC_MINT, user, this.treasuryKeypair);
    const userPUSDCATA = await getOrCreateATA(this.connection, PUSDC_MINT, user, this.treasuryKeypair);
    const userBal = await this.connection.getTokenAccountBalance(userUSDCATA).then(r => BigInt(r.value.amount));
    if (userBal < usdcUnits) throw new Error('Insufficient USDC balance');

    // Build tx
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
    const tx = new Transaction({
      feePayer: user,
      blockhash,
      lastValidBlockHeight,
    })
      .add(
        createTransferInstruction(
          userUSDCATA,
          this.treasuryUSDC,
          user,
          Number(usdcUnits)
        )
      )
      .add(
        createMintToInstruction(
          PUSDC_MINT,
          userPUSDCATA,
          this.treasuryAuthority,
          Number(pusdcUnits)
        )
      );

    return { tx, signers: [this.treasuryKeypair] };
  }

  /**
   * Build a transaction to burn pUSDC and withdraw USDC one-to-one.
   */
  public async buildWithdrawTx(
    user: PublicKey,
    uiAmount: number
  ): Promise<{ tx: Transaction; signers: Keypair[] }> {
    if (uiAmount <= 0) throw new Error('Withdraw amount must be positive');

    const pusdcUnits = toAtomic(uiAmount, PUSDC_DECIMALS);
    const usdcUnits = toAtomic(uiAmount, USDC_DECIMALS);

    // Fetch balances
    const userPUSDCATA = await getOrCreateATA(this.connection, PUSDC_MINT, user, this.treasuryKeypair);
    const userPBal = await this.connection.getTokenAccountBalance(userPUSDCATA).then(r => BigInt(r.value.amount));
    if (userPBal < pusdcUnits) throw new Error('Insufficient pUSDC balance');

    const treasuryBal = await this.connection.getTokenAccountBalance(this.treasuryUSDC).then(r => BigInt(r.value.amount));
    if (treasuryBal < usdcUnits) throw new Error('Treasury undercollateralized');

    const userUSDCATA = await getOrCreateATA(this.connection, USDC_MINT, user, this.treasuryKeypair);

    // Build tx
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
    const tx = new Transaction({
      feePayer: user,
      blockhash,
      lastValidBlockHeight,
    })
      .add(
        createBurnInstruction(
          userPUSDCATA,
          PUSDC_MINT,
          user,
          Number(pusdcUnits)
        )
      )
      .add(
        createTransferInstruction(
          this.treasuryUSDC,
          userUSDCATA,
          this.treasuryAuthority,
          Number(usdcUnits)
        )
      );

    return { tx, signers: [this.treasuryKeypair] };
  }

  /**
   * Check if total pUSDC supply equals USDC reserves × multiplier.
   */
  public async checkPegInvariant(): Promise<boolean> {
    const mintInfo = await getMint(this.connection, PUSDC_MINT);
    const totalSupply = BigInt(mintInfo.supply.toString());
    const reserves = BigInt(
      (await this.connection.getTokenAccountBalance(this.treasuryUSDC)).value.amount
    );
    return totalSupply === reserves * BigInt(DECIMAL_MULTIPLIER);
  }
} 