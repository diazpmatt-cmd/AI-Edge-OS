declare module "node:crypto" {
  interface ProviderControlHash {
    update(data: string): ProviderControlHash;
    digest(encoding: "hex"): string;
  }

  export function createHash(algorithm: "sha256"): ProviderControlHash;
}
