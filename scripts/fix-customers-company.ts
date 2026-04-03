import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const company = await prisma.company.findFirst();

  if (!company) {
    throw new Error('No existe company');
  }

  const customers = await prisma.customer.findMany({
    where: {
      companyId: undefined, // 🔥 FIX
    },
  });

  for (const c of customers) {
    await prisma.customer.update({
      where: { id: c.id },
      data: {
        companyId: company.id,
      },
    });
  }

  console.log('✅ Customers actualizados');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
