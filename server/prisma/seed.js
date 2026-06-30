const { prisma } = require('../src/db/prisma');

async function main() {
  const building = await prisma.building.upsert({
    where: { id: 'building-one-madison' },
    update: {},
    create: {
      id: 'building-one-madison',
      name: 'One Madison',
      address: 'One Madison Ave, New York, NY',
      description: 'Sample indoor map building',
    },
  });
  const floor = await prisma.floor.upsert({
    where: { id: 'floor-one-madison-01' },
    update: {},
    create: {
      id: 'floor-one-madison-01',
      buildingId: building.id,
      name: 'Floor 1',
      levelNumber: 1,
      sortOrder: 1,
      viewBox: JSON.stringify([0, 0, 1200, 780]),
      width: 1200,
      height: 780,
    },
  });
  await prisma.building.update({ where: { id: building.id }, data: { defaultFloorId: floor.id } });
  console.log(`Seeded ${building.name}`);
}

main().finally(async () => prisma.$disconnect());
