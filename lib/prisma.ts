import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

console.log("DATABASE_URL starts with:", process.env.DATABASE_URL?.slice(0, 40));
console.log("DIRECT_URL starts with:", process.env.DIRECT_URL?.slice(0, 40));

export const prisma =
  global.prisma ||
  new PrismaClient({
    log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
