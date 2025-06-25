import { Connection, Keypair, PublicKey, Transaction, SystemProgram, sendAndConfirmTransaction, TransactionInstruction } from '@solana/web3.js';
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, getAccount, getMint, createTransferInstruction, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, createMintToInstruction, createBurnInstruction } from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Constants for USDC and pUSDC
 */
export const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
export const PUSDC_MINT = new PublicKey('AhYwvKyAZYQeb9fZ1GMqt9PqWo1msdCsMtBFfHvnHKh');
export const USDC_DECIMALS = 6;
export const PUSDC_DECIMALS = 9;

const TREASURY_KEYPAIR_PATH = path.resolve(__dirname, '../../keypairs/treasury.json');

/**
 * Utility to load or generate a treasury authority keypair.
 */
function loadOrGenerateTreasuryKeypair(): Keypair {
  if (fs.existsSync(TREASURY_KEYPAIR_PATH)) {
    const raw = fs.readFileSync(TREASURY_KEYPAIR_PATH, 'utf-8');
    const arr = JSON.parse(raw);
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  } else {
    const kp = Keypair.generate();
    fs.mkdirSync(path.dirname(TREASURY_KEYPAIR_PATH), { recursive: true });
    fs.writeFileSync(TREASURY_KEYPAIR_PATH, JSON.stringify(Array.from(kp.secretKey)), 'utf-8');
    return kp;
  }
}

/**
 * Utility to get or create an associated token account.
 */
export async function getOrCreateATA(
  connection: Connection,
  mint: PublicKey,
  owner: PublicKey,
  payer: PublicKey
): Promise<PublicKey> {
  const ata = await getAssociatedTokenAddress(mint, owner, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const accountInfo = await connection.getAccountInfo(ata);
  if (!accountInfo) {
    const ix = createAssociatedTokenAccountInstruction(
      payer,
      ata,
      owner,
      mint,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const tx = new Transaction().add(ix);
    await sendAndConfirmTransaction(connection, tx, [Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(TREASURY_KEYPAIR_PATH, 'utf-8'))))]);
  }
  return ata;
}

/**
 * Utility to fetch SPL token balance for a given owner.
 */
export async function getTokenBalance(
  connection: Connection,
  mint: PublicKey,
  owner: PublicKey
): Promise<bigint> {
  const ata = await getAssociatedTokenAddress(mint, owner);
  const accountInfo = await connection.getTokenAccountBalance(ata).catch(() => null);
  if (!accountInfo) return BigInt(0);
  return BigInt(accountInfo.value.amount);
}

/**
 * TreasuryService handles treasury setup and deposit/withdrawal logic.
 */
export class TreasuryService {
  treasuryKeypair: Keypair;
  treasuryAuthority: PublicKey;
  treasuryUSDC: PublicKey | null = null;

  constructor() {
    this.treasuryKeypair = loadOrGenerateTreasuryKeypair();
    this.treasuryAuthority = this.treasuryKeypair.publicKey;
  }

  /**
   * Ensure the treasury USDC account exists, create if not.
   */
  async initTreasuryUSDCAccount(connection: Connection): Promise<PublicKey> {
    if (this.treasuryUSDC) return this.treasuryUSDC;
    this.treasuryUSDC = await getOrCreateATA(
      connection,
      USDC_MINT,
      this.treasuryAuthority,
      this.treasuryAuthority
    );
    return this.treasuryUSDC;
  }

  /**
   * Construct a deposit transaction (user deposits USDC, receives pUSDC)
   * @param connection Solana connection
   * @param user User's public key
   * @param amount Amount of USDC to deposit (in USDC units, e.g. 1.23)
   * @param opts Optional: slippage, min/max, etc.
   * @returns Transaction for the user to sign
   * @throws Error if user balance is insufficient or limits are violated
   */
  async depositUSDC(
    connection: Connection,
    user: PublicKey,
    amount: number,
    opts?: { min?: number; max?: number; slippageBps?: number }
  ): Promise<Transaction> {
    if (amount <= 0) throw new Error('Deposit amount must be positive');
    if (opts?.min !== undefined && amount < opts.min) throw new Error(`Deposit below minimum: ${opts.min}`);
    if (opts?.max !== undefined && amount > opts.max) throw new Error(`Deposit above maximum: ${opts.max}`);
    // Slippage: for 1:1, only relevant if you want to enforce exact minting
    const usdcAmount = BigInt(Math.round(amount * 10 ** USDC_DECIMALS));
    const pusdcAmount = BigInt(Math.round(amount * 10 ** PUSDC_DECIMALS));
    // Check user USDC balance
    const userUSDCBal = await getTokenBalance(connection, USDC_MINT, user);
    if (userUSDCBal < usdcAmount) throw new Error('Insufficient USDC balance');
    // Ensure treasury USDC account exists
    const treasuryUSDC = await this.initTreasuryUSDCAccount(connection);
    // Ensure user USDC ATA exists
    const userUSDC = await getOrCreateATA(connection, USDC_MINT, user, user);
    // Ensure user pUSDC ATA exists
    const userPUSDC = await getOrCreateATA(connection, PUSDC_MINT, user, user);
    // Build transaction
    const tx = new Transaction();
    // 1. Transfer USDC from user to treasury
    tx.add(
      createTransferInstruction(
        userUSDC,
        treasuryUSDC,
        user,
        Number(usdcAmount),
        [],
        TOKEN_PROGRAM_ID
      )
    );
    // 2. Mint pUSDC to user (treasury is mint authority)
    tx.add(
      createMintToInstruction(
        PUSDC_MINT,
        userPUSDC,
        this.treasuryAuthority,
        Number(pusdcAmount),
        [],
        TOKEN_PROGRAM_ID
      )
    );
    return tx;
  }

  /**
   * Construct a withdrawal transaction (user burns pUSDC, receives USDC)
   * @param connection Solana connection
   * @param user User's public key
   * @param amount Amount of pUSDC to redeem (in pUSDC units, e.g. 1.23)
   * @param opts Optional: slippage, min/max, etc.
   * @returns Transaction for the user to sign
   * @throws Error if user/treasury balance is insufficient or limits are violated
   */
  async withdrawUSDC(
    connection: Connection,
    user: PublicKey,
    amount: number,
    opts?: { min?: number; max?: number; slippageBps?: number }
  ): Promise<Transaction> {
    if (amount <= 0) throw new Error('Withdraw amount must be positive');
    if (opts?.min !== undefined && amount < opts.min) throw new Error(`Withdraw below minimum: ${opts.min}`);
    if (opts?.max !== undefined && amount > opts.max) throw new Error(`Withdraw above maximum: ${opts.max}`);
    const pusdcAmount = BigInt(Math.round(amount * 10 ** PUSDC_DECIMALS));
    const usdcAmount = BigInt(Math.round(amount * 10 ** USDC_DECIMALS));
    // Check user pUSDC balance
    const userPUSDCBal = await getTokenBalance(connection, PUSDC_MINT, user);
    if (userPUSDCBal < pusdcAmount) throw new Error('Insufficient pUSDC balance');
    // Check treasury USDC reserves
    const reserves = await this.getTreasuryReserves(connection);
    if (reserves < usdcAmount) throw new Error('Treasury has insufficient USDC reserves');
    // Ensure treasury USDC account exists
    const treasuryUSDC = await this.initTreasuryUSDCAccount(connection);
    // Ensure user USDC ATA exists
    const userUSDC = await getOrCreateATA(connection, USDC_MINT, user, user);
    // Ensure user pUSDC ATA exists
    const userPUSDC = await getOrCreateATA(connection, PUSDC_MINT, user, user);
    // Build transaction
    const tx = new Transaction();
    // 1. Burn pUSDC from user (treasury is mint authority)
    tx.add(
      createBurnInstruction(
        userPUSDC,
        PUSDC_MINT,
        user,
        Number(pusdcAmount),
        [],
        TOKEN_PROGRAM_ID
      )
    );
    // 2. Transfer USDC from treasury to user
    tx.add(
      createTransferInstruction(
        treasuryUSDC,
        userUSDC,
        this.treasuryAuthority,
        Number(usdcAmount),
        [],
        TOKEN_PROGRAM_ID
      )
    );
    return tx;
  }

  /**
   * Get pUSDC balance for a user
   */
  async getPUSDCBalance(connection: Connection, user: PublicKey): Promise<bigint> {
    return getTokenBalance(connection, PUSDC_MINT, user);
  }

  /**
   * Get USDC balance for a user
   */
  async getUSDCBalance(connection: Connection, user: PublicKey): Promise<bigint> {
    return getTokenBalance(connection, USDC_MINT, user);
  }

  /**
   * Get total USDC in treasury
   */
  async getTreasuryReserves(connection: Connection): Promise<bigint> {
    await this.initTreasuryUSDCAccount(connection);
    return getTokenBalance(connection, USDC_MINT, this.treasuryAuthority);
  }

  /**
   * Check if withdrawal is possible
   */
  async canWithdraw(connection: Connection, amount: bigint): Promise<boolean> {
    const reserves = await this.getTreasuryReserves(connection);
    return reserves >= amount;
  }
} 