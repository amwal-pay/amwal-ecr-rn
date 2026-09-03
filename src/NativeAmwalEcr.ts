import {
  TurboModuleRegistry,
  type CodegenTypes,
  type TurboModule,
} from 'react-native';

export interface Spec extends TurboModule {
  isReachable(request: CodegenTypes.UnsafeObject): Promise<boolean>;
  sale(request: CodegenTypes.UnsafeObject): Promise<CodegenTypes.UnsafeObject>;
  voidTransaction(
    request: CodegenTypes.UnsafeObject
  ): Promise<CodegenTypes.UnsafeObject>;
  refund(
    request: CodegenTypes.UnsafeObject
  ): Promise<CodegenTypes.UnsafeObject>;
  inquire(
    request: CodegenTypes.UnsafeObject
  ): Promise<CodegenTypes.UnsafeObject>;
  inquireByReference(
    request: CodegenTypes.UnsafeObject
  ): Promise<CodegenTypes.UnsafeObject>;
  receipt(
    request: CodegenTypes.UnsafeObject
  ): Promise<CodegenTypes.UnsafeObject>;
  cancel(operationId: string): Promise<boolean>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('AmwalEcr');
