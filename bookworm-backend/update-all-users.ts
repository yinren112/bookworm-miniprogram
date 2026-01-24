import prisma from './src/db';

async function main() {
  // 先查看所有用户
  const allUsers = await prisma.user.findMany({
    orderBy: { id: 'asc' }
  });

  console.log(`\n找到 ${allUsers.length} 个用户\n`);

  // 更新所有用户为STAFF（不管当前是什么角色）
  const result = await prisma.user.updateMany({
    data: { role: 'STAFF' }
  });

  console.log(`✅ 已更新 ${result.count} 个用户为 STAFF\n`);

  // 验证结果
  const staffCount = await prisma.user.count({
    where: { role: 'STAFF' }
  });

  console.log(`📊 当前STAFF用户数: ${staffCount}`);
  console.log(`📊 总用户数: ${allUsers.length}\n`);

  if (staffCount === allUsers.length) {
    console.log('✅ 所有用户都已成功更新为STAFF!\n');
  } else {
    console.log('⚠️  警告：仍有用户不是STAFF角色\n');
  }

  await prisma.$disconnect();
}

main().catch(console.error);
