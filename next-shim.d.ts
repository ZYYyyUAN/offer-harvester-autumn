declare module "next" {
  export type Metadata = Record<string, unknown>;
  export type NextConfig = Record<string, unknown>;
}

declare module "next/headers" {
  export function headers(): Promise<Headers>;
}

declare module "next/navigation" {
  export function redirect(url: string): never;
}
