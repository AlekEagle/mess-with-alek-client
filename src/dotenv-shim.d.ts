export {};

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      readonly TOKEN: string;
      readonly DEBUG: string;
    }
  }
}
