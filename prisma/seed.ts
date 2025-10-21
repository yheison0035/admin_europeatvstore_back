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
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
