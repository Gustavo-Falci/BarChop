import { PrismaClient } from "@prisma/client";

// Em dev, o hot-reload recriaria o PrismaClient a cada mudança de
// arquivo sem isso — reaproveita a instância guardada no global.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export * from "@prisma/client";
