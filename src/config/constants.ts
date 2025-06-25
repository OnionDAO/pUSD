import { PublicKey } from '@solana/web3.js';

// Network constants
export const NETWORKS = {
  MAINNET: 'mainnet-beta',
  DEVNET: 'devnet',
  TESTNET: 'testnet',
  LOCALNET: 'localnet'
} as const;

// Default network
export const DEFAULT_NETWORK = NETWORKS.DEVNET;

// Program IDs
export const PROGRAM_IDS = {
  TOKEN_PROGRAM: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
  TOKEN_2022_PROGRAM: new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'),
  ASSOCIATED_TOKEN_PROGRAM: new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'),
  SYSTEM_PROGRAM: new PublicKey('11111111111111111111111111111111'),
  RENT: new PublicKey('SysvarRent111111111111111111111111111111111'),
  METADATA_PROGRAM: new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'),
} as const;

// Token constants
export const TOKEN_CONSTANTS = {
  DECIMALS: 6,
  SUPPLY: 1_000_000_000, // 1 billion tokens
  MINIMUM_BALANCE: 0.001,
  MAX_TRANSFER_AMOUNT: 1_000_000,
} as const;

// Fee constants
export const FEES = {
  MINT_FEE: 0.001, // SOL
  BURN_FEE: 0.001, // SOL
  TRANSFER_FEE: 0.0005, // SOL
} as const;

// Time constants
export const TIME_CONSTANTS = {
  TRANSACTION_TIMEOUT: 30000, // 30 seconds
  RETRY_DELAY: 1000, // 1 second
  MAX_RETRIES: 3,
} as const;

// Error messages
export const ERROR_MESSAGES = {
  INSUFFICIENT_BALANCE: 'Insufficient balance',
  INVALID_AMOUNT: 'Invalid amount',
  TRANSACTION_FAILED: 'Transaction failed',
  NETWORK_ERROR: 'Network error',
  INVALID_KEYPAIR: 'Invalid keypair',
} as const;
