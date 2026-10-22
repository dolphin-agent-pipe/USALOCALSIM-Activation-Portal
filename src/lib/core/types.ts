import type { CoreTxnStatusCode } from "./status";

/** Appendix A — network opcodes */
export const CORE_OPCODES = {
  THREE: "3NETWORK",
  VODAFONE: "VOD",
  O2: "O2",
  EE: "EE",
  LYCA: "LY",
  LEBARA: "LEB",
  GIFFGAFF: "GG",
  VOXI: "VOXI",
} as const;

export type CoreOpcode = (typeof CORE_OPCODES)[keyof typeof CORE_OPCODES] | string;

/** Appendix B — delivery methods */
export const CORE_TYPE_TXN = {
  VOUCHER: "Voucher",
  DIRECT: "Direct",
  BUNDLE: "Bundle",
} as const;

export type CoreTypeTxn = (typeof CORE_TYPE_TXN)[keyof typeof CORE_TYPE_TXN] | string;

export type CoreTokenResponse = {
  success: boolean;
  data?: {
    name?: string;
    token?: string;
  };
  message?: string;
};

export type CoreNetwork = {
  name: string;
  op_code: string;
  op_image?: string;
  voucher?: number;
  voucher_code?: string;
  direct?: number;
  direct_code?: string;
  bundle?: number;
  bundle_code?: string;
  help?: string;
};

export type CoreNetworkListResponse = {
  success: boolean;
  code?: string;
  status?: number;
  message?: string;
  data?: CoreNetwork[];
};

export type CoreSkuOffer = {
  value: number;
  now_data?: string | null;
  text?: string | null;
  calls?: string | null;
  day?: string | null;
};

export type CoreNetworkSkuResponse = {
  success: boolean;
  code?: string;
  status?: number;
  message?: string;
  data?: CoreSkuOffer[];
};

export type CoreTransactionRequest = {
  mobile: string;
  opcode: CoreOpcode;
  amount: number;
  type_txn: CoreTypeTxn;
  /** API user reference; length must be > 8 and < 20 */
  ref_txn_id: string;
};

export type CoreTransactionResponse = {
  success: boolean;
  status: CoreTxnStatusCode | number;
  message?: string;
  transaction_id?: string;
  date?: string;
};

export type CoreCallbackQuery = {
  transaction_id?: string;
  status?: string;
  ref_txn_id?: string;
};
