import { PrismaClient } from '@prisma/client';
import slugify from 'slugify';

const prisma = new PrismaClient();

async function main() {
  const products = await prisma.inventory.findMany({
    where: { slug: null },
  });

  for (const product of products) {
    const baseSlug = slugify(product.name, {
      lower: true,
      strict: true,
    });

    let slug = baseSlug;
    let counter = 1;

    while (
      await prisma.inventory.findFirst({
        where: { slug },
      })
    ) {
      slug = `${baseSlug}-${counter++}`;
    }

    await prisma.inventory.update({
      where: { id: product.id },
      data: { slug },
    });
  }

  console.log('✅ Slugs generados correctamente');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
