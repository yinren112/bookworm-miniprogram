// 临时脚本：将最新注册的用户提升为STAFF角色
// 使用方法: npx ts-node upgrade-user-to-staff.ts [user_id]

import prisma from './src/db';

async function main() {
  const userId = process.argv[2] ? parseInt(process.argv[2]) : null;

  if (userId) {
    // 如果提供了用户ID，直接更新
    console.log(`\n正在将用户 ID ${userId} 提升为 STAFF...`);

    const user = await prisma.user.update({
      where: { id: userId },
      data: { role: 'STAFF' },
      select: { id: true, openid: true, role: true, created_at: true }
    });

    console.log('\n✅ 权限提升成功！');
    console.log('用户信息:');
    console.log(`  ID: ${user.id}`);
    console.log(`  OpenID: ${user.openid.substring(0, 10)}...`);
    console.log(`  角色: ${user.role}`);
    console.log(`  创建时间: ${user.created_at.toISOString()}`);
  } else {
    // 如果没有提供用户ID，显示最近10个用户供选择
    console.log('\n📋 最近注册的用户列表:\n');

    const users = await prisma.user.findMany({
      orderBy: { created_at: 'desc' },
      take: 10,
      select: {
        id: true,
        openid: true,
        role: true,
        created_at: true
      }
    });

    if (users.length === 0) {
      console.log('数据库中没有用户');
      return;
    }

    console.table(
      users.map(u => ({
        ID: u.id,
        'OpenID (前10位)': u.openid.substring(0, 10) + '...',
        角色: u.role,
        创建时间: u.created_at.toISOString()
      }))
    );

    console.log('\n📌 使用方法:');
    console.log('   1. 找到你的用户ID（通常是最新的那个）');
    console.log('   2. 执行: npx ts-node upgrade-user-to-staff.ts <你的用户ID>');
    console.log('   例如: npx ts-node upgrade-user-to-staff.ts 5\n');
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('❌ 错误:', e);
  process.exit(1);
});
