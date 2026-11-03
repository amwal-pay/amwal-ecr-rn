/**
 * Response codes the terminal generates itself, before anything reaches the
 * payment backend. Anything else is the backend's code, passed through.
 * The terminal's approved flag is authoritative — never decide from a code alone.
 */
export const EcrResponseCode = {
  approved: '00',
  unsupportedOperation: '12',
  invalidAmount: '13',
  cancelledAtTerminal: '17',
  originalNotFound: '25',
  securityViolation: '63',
  indeterminate: '91',
  alreadyAnswered: '94',
  terminalBusy: '96',
} as const;

const terminalGenerated = new Set<string>(Object.values(EcrResponseCode));

export function isTerminalGeneratedResponseCode(code: string): boolean {
  return terminalGenerated.has(code);
}

/**
 * `91` and `94` leave the financial outcome unknown. Every other
 * terminal-generated refusal happened before the backend, and a backend
 * decline is a decision.
 */
export function responseCodeLeavesOutcomeUnknown(code: string): boolean {
  return (
    code === EcrResponseCode.indeterminate ||
    code === EcrResponseCode.alreadyAnswered
  );
}
