import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Actualizando customers...');

  const company = await prisma.company.findFirst();

  if (!company) {
    throw new Error('❌ No existe company');
  }

  const result = await prisma.customer.updateMany({
    data: {
      companyId: company.id,
    },
  });

  console.log(`✅ Customers actualizados: ${result.count}`);
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
