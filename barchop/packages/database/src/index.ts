import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

// Prisma 7: sem motor próprio, o cliente fala com o Postgres pelo driver
// `pg`, e o pool é o do `pg` (máximo de 10 conexões). O timeout repete o
// do Prisma 5 — o `pg` sozinho esperaria uma conexão para sempre.
function criarPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5_000,
  });
  return new PrismaClient({ adapter });
}

// Em dev, o hot-reload recriaria o PrismaClient a cada mudança de
// arquivo sem isso — reaproveita a instância guardada no global.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? criarPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export * from "./generated/prisma/client";
