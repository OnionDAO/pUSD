import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import {
  createInitializeMintInstruction,
  createMintToInstruction,
  createBurnInstruction,
  createTransferInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import {
  createInitializeMintInstruction as createInitializeMint2022Instruction,
  createMintToInstruction as createMintTo2022Instruction,
  createBurnInstruction as createBurn2022Instruction,
  createTransferInstruction as createTransfer2022Instruction,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';
import { PROGRAM_IDS, TOKEN_CONSTANTS } from '../config/constants';
import { MintRequest, BurnRequest, TransferRequest } from '../types/token';
import { TransactionResult } from '../types/transaction';
import { logger } from '../utils/logger';

export class Token2022Manager {
  private connection: Connection;
  private programId: PublicKey;

  constructor(connection: Connection, useToken2022: boolean = true) {
    this.connection = connection;
    this.programId = useToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
  }

  /**
   * Create a new Token 2022 mint
   */
  async createMint(
    payer: Keypair,
    mintAuthority: PublicKey,
    freezeAuthority: PublicKey | null,
    decimals: number = TOKEN_CONSTANTS.DECIMALS
  ): Promise<{ mint: Keypair; signature: string }> {
    try {
      const mint = Keypair.generate();
      
      const instruction = createInitializeMint2022Instruction(
        mint.publicKey,
        decimals,
        mintAuthority,
        freezeAuthority,
        this.programId
      );

      const transaction = new Transaction().add(instruction);
      
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [payer, mint],
        { commitment: 'confirmed' }
      );

      logger.info(`Created Token 2022 mint: ${mint.publicKey.toString()}`);
      
      return { mint, signature };
    } catch (error) {
      logger.error('Failed to create mint:', error);
      throw error;
    }
  }

  /**
   * Create associated token account
   */
  async createAssociatedTokenAccount(
    payer: Keypair,
    mint: PublicKey,
    owner: PublicKey
  ): Promise<{ address: PublicKey; signature: string }> {
    try {
      const associatedTokenAddress = await getAssociatedTokenAddress(
        mint,
        owner,
        false,
        this.programId
      );

      const instruction = createAssociatedTokenAccountInstruction(
        payer.publicKey,
        associatedTokenAddress,
        owner,
        mint,
        this.programId
      );

      const transaction = new Transaction().add(instruction);
      
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [payer],
        { commitment: 'confirmed' }
      );

      logger.info(`Created associated token account: ${associatedTokenAddress.toString()}`);
      
      return { address: associatedTokenAddress, signature };
    } catch (error) {
      logger.error('Failed to create associated token account:', error);
      throw error;
    }
  }

  /**
   * Mint tokens
   */
  async mint(
    payer: Keypair,
    mint: PublicKey,
    destination: PublicKey,
    authority: Keypair,
    amount: bigint
  ): Promise<TransactionResult> {
    try {
      const instruction = createMintTo2022Instruction(
        mint,
        destination,
        authority.publicKey,
        amount,
        [],
        this.programId
      );

      const transaction = new Transaction().add(instruction);
      
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [payer, authority],
        { commitment: 'confirmed' }
      );

      logger.info(`Minted ${amount} tokens to ${destination.toString()}`);
      
      return {
        signature,
        success: true,
        confirmationStatus: 'confirmed'
      };
    } catch (error) {
      logger.error('Failed to mint tokens:', error);
      return {
        signature: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Burn tokens
   */
  async burn(
    mint: PublicKey,
    source: PublicKey,
    authority: Keypair,
    amount: bigint
  ): Promise<TransactionResult> {
    try {
      const instruction = createBurn2022Instruction(
        mint,
        source,
        authority.publicKey,
        amount,
        [],
        this.programId
      );

      const transaction = new Transaction().add(instruction);
      
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [authority],
        { commitment: 'confirmed' }
      );

      logger.info(`Burned ${amount} tokens from ${source.toString()}`);
      
      return {
        signature,
        success: true,
        confirmationStatus: 'confirmed'
      };
    } catch (error) {
      logger.error('Failed to burn tokens:', error);
      return {
        signature: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Transfer tokens
   */
  async transfer(
    source: PublicKey,
    destination: PublicKey,
    authority: Keypair,
    amount: bigint
  ): Promise<TransactionResult> {
    try {
      const instruction = createTransfer2022Instruction(
        source,
        destination,
        authority.publicKey,
        amount,
        [],
        this.programId
      );

      const transaction = new Transaction().add(instruction);
      
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [authority],
        { commitment: 'confirmed' }
      );

      logger.info(`Transferred ${amount} tokens from ${source.toString()} to ${destination.toString()}`);
      
      return {
        signature,
        success: true,
        confirmationStatus: 'confirmed'
      };
    } catch (error) {
      logger.error('Failed to transfer tokens:', error);
      return {
        signature: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get token balance
   */
  async getBalance(account: PublicKey): Promise<bigint> {
    try {
      const accountInfo = await this.connection.getTokenAccountBalance(account);
      return BigInt(accountInfo.value.amount);
    } catch (error) {
      logger.error('Failed to get token balance:', error);
      return BigInt(0);
    }
  }

  /**
   * Get mint info
   */
  async getMintInfo(mint: PublicKey) {
    try {
      const mintInfo = await this.connection.getParsedAccountInfo(mint);
      return mintInfo.value;
    } catch (error) {
      logger.error('Failed to get mint info:', error);
      throw error;
    }
  }
}
