import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Iniciando migración...');

  // 1. Verificar si ya existe la empresa
  let company = await prisma.company.findFirst({
    where: { name: 'EUROPEATVSTORE' },
  });

  if (!company) {
    company = await prisma.company.create({
      data: {
        name: 'EUROPEATVSTORE',
        logo: '/images/europeatvstore.png',
        type: 'RETAIL',
      },
    });

    console.log('✅ Empresa creada:', company.id);
  } else {
    console.log('ℹ️ Empresa ya existe:', company.id);
  }

  // 2. Actualizar usuarios SIN empresa
  const usersUpdated = await prisma.user.updateMany({
    where: {
      companyId: null as any,
    },
    data: {
      companyId: company.id,
    },
  });

  console.log(`👤 Usuarios actualizados: ${usersUpdated.count}`);

  // 3. Actualizar locales SIN empresa
  const localsUpdated = await prisma.local.updateMany({
    where: {
      companyId: null as any,
    },
    data: {
      companyId: company.id,
    },
  });

  console.log(`🏢 Locales actualizados: ${localsUpdated.count}`);

  console.log('🎉 Migración completada');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
