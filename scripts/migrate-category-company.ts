import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // ✅ TRAER LOCAL (FIX ERROR)
  const categories = await prisma.category.findMany({
    include: { local: true },
  });

  for (const c of categories) {
    if (!c.localId) continue;

    const local = await prisma.local.findUnique({
      where: { id: c.localId },
    });

    if (!local) continue;

    await prisma.category.update({
      where: { id: c.id },
      data: {
        companyId: local.companyId,
      },
    });
  }

  console.log('✅ Categories migradas');

  // 🔥 BRANDS
  const brands = await prisma.brand.findMany({
    include: { local: true },
  });

  for (const b of brands) {
    if (!b.localId) continue;

    const local = await prisma.local.findUnique({
      where: { id: b.localId },
    });

    if (!local) continue;

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
  .catch(console.error)
  .finally(() => prisma.$disconnect());
