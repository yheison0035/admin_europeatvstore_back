import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Migrando categories y brands...');

  const categories = await prisma.category.findMany({
    include: { local: true },
  });

  for (const c of categories) {
    if (!c.localId) continue;

    const local = await prisma.local.findUnique({
      where: { id: c.localId },
    });

    if (!local || !local.companyId) continue;

    await prisma.category.update({
      where: { id: c.id },
      data: {
        companyId: local.companyId,
      },
    });
  }

  console.log('✅ Categories migradas');

  const brands = await prisma.brand.findMany({
    include: { local: true },
  });

  for (const b of brands) {
    if (!b.localId) continue;

    const local = await prisma.local.findUnique({
      where: { id: b.localId },
    });

    if (!local || !local.companyId) continue;

    await prisma.brand.update({
      where: { id: b.id },
      data: {
        companyId: local.companyId,
      },
    });
  }

  console.log('✅ Brands migradas');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
