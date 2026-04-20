import { customType } from "drizzle-orm/pg-core";

// Drizzle doesn't ship a native pgvector type. This custom column emits the
// SQL `vector(N)` type and reads/writes it as a JS number[] (pgvector
// accepts the JSON-array text form `[1,2,3]` and returns the same).
export const vector = (name: string, opts: { dimensions: number }) =>
  customType<{ data: number[]; driverData: string }>({
    dataType() {
      return `vector(${opts.dimensions})`;
    },
    toDriver(value: number[]) {
      return `[${value.join(",")}]`;
    },
    fromDriver(value: string): number[] {
      // pg returns it as the literal text "[1,2,3]"
      return JSON.parse(value);
    },
  })(name);
