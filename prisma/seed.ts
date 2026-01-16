import { PrismaClient, Role, Status } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash('europeatvstore123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'yheison0035@gmail.com' },
    update: {},
    create: {
      name: 'Yeison Suarez',
      email: 'yheison0035@gmail.com',
      password,
      role: Role.SUPER_ADMIN,
      status: Status.ACTIVO,
    },
  });

  console.log('✅ Super admin creado:', admin.email);

  const consumidorFinal = await prisma.customer.upsert({
    where: { document: '222222222222' },
    update: {},
    create: {
      name: 'CONSUMIDOR FINAL',
      document: '222222222222',
      status: Status.ACTIVO,
    },
  });

  console.log('✅ Cliente Consumidor Final listo:', consumidorFinal);
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
