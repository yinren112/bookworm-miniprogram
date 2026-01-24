// 将所有用户提升为STAFF角色
import prisma from './src/db';

async function main() {
  console.log('\n正在将所有用户提升为 STAFF...\n');

  const result = await prisma.user.updateMany({
    where: {
      role: 'USER' // 只更新当前是USER的用户
    },
    data: {
      role: 'STAFF'
    }
  });

  console.log(`✅ 成功更新 ${result.count} 个用户为 STAFF 角色`);

  // 显示更新后的所有用户
  const allUsers = await prisma.user.findMany({
    orderBy: { created_at: 'desc' },
    select: {
      id: true,
      openid: true,
      role: true,
      created_at: true
    }
  });

  console.log('\n📋 当前所有用户:\n');
  console.table(
    allUsers.map(u => ({
      ID: u.id,
      'OpenID (前10位)': u.openid.substring(0, 10) + '...',
      角色: u.role,
      创建时间: u.created_at.toISOString()
    }))
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('❌ 错误:', e);
  process.exit(1);
});
