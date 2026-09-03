export class EcrOperation<T> {
  readonly operationId: string;
  readonly result: Promise<T>;
  private readonly onCancel: (operationId: string) => Promise<boolean>;
  private cancelRequested = false;

  constructor(
    operationId: string,
    result: Promise<T>,
    onCancel: (operationId: string) => Promise<boolean>
  ) {
    this.operationId = operationId;
    this.result = result;
    this.onCancel = onCancel;
  }

  get isCancelRequested(): boolean {
    return this.cancelRequested;
  }

  cancel(): Promise<boolean> {
    this.cancelRequested = true;
    return this.onCancel(this.operationId);
  }
}
