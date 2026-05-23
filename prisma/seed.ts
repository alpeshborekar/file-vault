import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('Secret123', 12);

  const user = await prisma.user.upsert({
    where:  { email: 'dev@example.com' },
    update: {},
    create: {
      email:             'dev@example.com',
      passwordHash,
      storageQuotaBytes: BigInt(5 * 1024 * 1024 * 1024), // 5 GB
    },
  });

  console.log(`✅  Seed user ready: ${user.email} / Secret123`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());