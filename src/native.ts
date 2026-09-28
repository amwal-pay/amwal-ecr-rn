import type NativeAmwalEcr from './NativeAmwalEcr';

const unsupported = (): never => {
  throw new Error(
    "'react-native-amwal-ecr' is only supported on Android and iOS."
  );
};

export const nativeEcr: typeof NativeAmwalEcr = {
  isReachable: async () => unsupported(),
  sale: async () => unsupported(),
  voidTransaction: async () => unsupported(),
  refund: async () => unsupported(),
  inquire: async () => unsupported(),
  inquireByReference: async () => unsupported(),
  signOn: async () => unsupported(),
  closeReceipt: async () => unsupported(),
  receipt: async () => unsupported(),
  cancel: async () => unsupported(),
};
