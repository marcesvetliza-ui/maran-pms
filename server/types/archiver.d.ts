declare module "archiver" {
  import type { Readable } from "node:stream";

  interface Archiver extends Readable {
    append(source: string | NodeJS.ReadableStream | Buffer, data: { name: string }): this;
    abort(): void;
    finalize(): void;
  }

  interface ArchiverFactory {
    (format: "zip", options?: {
      zlib?: { level?: number };
      highWaterMark?: number;
    }): Archiver;
  }

  const archiver: ArchiverFactory;
  export default archiver;
}