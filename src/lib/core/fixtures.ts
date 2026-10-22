import type {
  CoreNetworkListResponse,
  CoreNetworkSkuResponse,
  CoreTokenResponse,
  CoreTransactionResponse,
} from "./types";
import { CORE_TXN_STATUS } from "./status";

export const CORE_FIXTURE_TOKEN_RESPONSE: CoreTokenResponse = {
  success: true,
  data: {
    name: "UAT Fixture Client",
    token: "fixture-bearer-token",
  },
  message: "Token generated (fixture)",
};

export const CORE_FIXTURE_NETWORK_LIST: CoreNetworkListResponse = {
  success: true,
  code: "200",
  status: 2,
  message: "Network List",
  data: [
    {
      name: "THREE",
      op_code: "3NETWORK",
      voucher: 1,
      voucher_code: "Voucher",
      direct: 1,
      direct_code: "Direct",
      bundle: 1,
      bundle_code: "Bundle",
      help: "To top up call 444 and enter Voucher PIN number or Top-Up online at THREE.CO.UK/Topup.",
    },
    {
      name: "Vodafone",
      op_code: "VOD",
      voucher: 1,
      direct: 1,
      bundle: 1,
    },
  ],
};

export const CORE_FIXTURE_THREE_BUNDLE_SKUS: CoreNetworkSkuResponse = {
  success: true,
  code: "200",
  status: 2,
  message: "Offer List",
  data: [
    { value: 10, now_data: null, text: "Unlimited", calls: "Unlimited", day: "30" },
    { value: 15, now_data: null, text: "Unlimited", calls: "Unlimited", day: "30" },
    { value: 20, now_data: null, text: "Unlimited", calls: "Unlimited", day: "30" },
    { value: 25, now_data: null, text: "Unlimited", calls: "Unlimited", day: "30" },
    { value: 30, now_data: null, text: "Unlimited", calls: "Unlimited", day: "30" },
  ],
};

export function coreFixtureTransactionSuccess(refTxnId: string): CoreTransactionResponse {
  return {
    success: true,
    status: CORE_TXN_STATUS.SUCCESS,
    message: "Transaction successfully completed.",
    transaction_id: `Core_FIXTURE_${refTxnId}`,
    date: new Date().toISOString(),
  };
}

export function coreFixtureTransactionProcessing(refTxnId: string): CoreTransactionResponse {
  return {
    success: true,
    status: CORE_TXN_STATUS.PROCESSING,
    message: "Transaction Will Complete When SIM is Active.",
    transaction_id: `Core_FIXTURE_${refTxnId}`,
    date: new Date().toISOString(),
  };
}
