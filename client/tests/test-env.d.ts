declare const __dirname: string;

declare const process: {
  cwd(): string;
};

declare module "node:fs" {
  export function readFileSync(path: string, encoding: BufferEncoding): string;
}

declare module "node:fs/promises" {
  export function readFile(path: string, encoding: BufferEncoding): Promise<string>;
}

declare module "node:path" {
  export function resolve(...paths: string[]): string;
}
