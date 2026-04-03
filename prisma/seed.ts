import { PrismaClient, Role, Status } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash('europeatvstore123', 10);

  // ✅ Crear empresa base (si no existe)
  let company = await prisma.company.findFirst();

  if (!company) {
    company = await prisma.company.create({
      data: {
        name: 'RAGNOR BARBER',
      },
    });
  }

  // ✅ Usuario admin
  const admin = await prisma.user.upsert({
    where: { email: 'ragnorbarber@gmail.com' },
    update: {},
    create: {
      name: 'Yeison Suarez',
      email: 'yheison0035@gmail.com',
      password,
      role: Role.SUPER_ADMIN,
      status: Status.ACTIVO,
      company: {
        connect: { id: company.id },
      },
    },
  });

  console.log('✅ Super admin creado:', admin.email);

  // ✅ Consumidor final (IMPORTANTE FIX)
  const consumidorFinal = await prisma.customer.upsert({
    where: {
      document_companyId: {
        document: '222222222222',
        companyId: company.id,
      },
    },
    update: {},
    create: {
      name: 'CONSUMIDOR FINAL',
      document: '222222222222',
      status: Status.ACTIVO,
      company: {
        connect: { id: company.id },
      },
    },
  });

  console.log('✅ Cliente Consumidor Final listo:', consumidorFinal.name);
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
