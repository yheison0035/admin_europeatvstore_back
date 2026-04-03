import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // ⚠️ Ajusta esto según tu caso
  const defaultCompany = await prisma.company.findFirst();

  if (!defaultCompany) {
    throw new Error('No hay empresas creadas');
  }

  await prisma.provider.updateMany({
    where: {
      companyId: undefined,
    },
    data: {
      companyId: defaultCompany.id,
    },
  });

  console.log('✅ Providers actualizados');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
