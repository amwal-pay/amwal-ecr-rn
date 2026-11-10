/**
 * Operations a terminal can be asked to run. Field for field with Flutter
 * `EcrTransactionType`. What the terminal will accept is a separate question.
 */
export interface EcrTransactionType {
  readonly id: EcrTransactionTypeId;
  readonly messageType: string;
  readonly displayName: string;
  readonly requiresAmount: boolean;
  readonly requiresOriginalStan: boolean;
  readonly requiresOriginalDate: boolean;
}

export type EcrTransactionTypeId =
  | 'sale'
  | 'voidTransaction'
  | 'refund'
  | 'inquiry'
  | 'receipt'
  | 'signOn'
  | 'closeReceipt'
  | 'settlement';

function define(
  id: EcrTransactionTypeId,
  messageType: string,
  displayName: string,
  requiresAmount: boolean,
  requiresOriginalStan: boolean,
  requiresOriginalDate: boolean
): EcrTransactionType {
  return {
    id,
    messageType,
    displayName,
    requiresAmount,
    requiresOriginalStan,
    requiresOriginalDate,
  };
}

export const ECR_TRANSACTION_TYPES: {
  readonly [Key in EcrTransactionTypeId]: EcrTransactionType;
} = {
  sale: define('sale', 'SALE', 'Sale', true, false, false),
  voidTransaction: define(
    'voidTransaction',
    'VOID',
    'Void',
    false,
    true,
    false
  ),
  refund: define('refund', 'REFUND', 'Refund', true, true, true),
  inquiry: define('inquiry', 'INQUIRY', 'Inquiry', false, true, true),
  receipt: define('receipt', 'RECEIPT', 'Receipt', false, true, true),
  signOn: define('signOn', 'SIGN_ON', 'Sign-on', false, false, false),
  closeReceipt: define(
    'closeReceipt',
    'CLOSE_RECEIPT',
    'Close receipt',
    false,
    false,
    false
  ),
  settlement: define(
    'settlement',
    'SETTLEMENT',
    'Settlement',
    false,
    false,
    false
  ),
};

/** Sale, void, and refund. Inquiry and receipt report on a transaction. */
export function transactionTypeMovesMoney(type: EcrTransactionType): boolean {
  return (
    type.id === 'sale' || type.id === 'voidTransaction' || type.id === 'refund'
  );
}

/**
 * The operations an operator picks, in the order a till usually offers them.
 * Receipt, sign-on, close receipt, and settlement stay off this list.
 */
export const ECR_MENU_OPTIONS: readonly EcrTransactionType[] = [
  ECR_TRANSACTION_TYPES.sale,
  ECR_TRANSACTION_TYPES.voidTransaction,
  ECR_TRANSACTION_TYPES.refund,
  ECR_TRANSACTION_TYPES.inquiry,
];
