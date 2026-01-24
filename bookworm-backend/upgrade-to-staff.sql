-- Step 1: 查询所有用户，找到你的用户ID
-- 按创建时间倒序排列，最新注册的用户在最上面
SELECT
  id,
  openid,
  role,
  created_at,
  SUBSTRING(openid, 1, 10) || '...' as openid_preview
FROM "User"
ORDER BY created_at DESC
LIMIT 10;

-- Step 2: 找到你的用户ID后，将下面的 <YOUR_USER_ID> 替换成实际的ID，然后执行
-- 例如，如果你的ID是 5，就改成 WHERE id = 5;

-- UPDATE "User" SET role = 'STAFF' WHERE id = <YOUR_USER_ID>;

-- Step 3: 验证修改成功
-- SELECT id, role FROM "User" WHERE id = <YOUR_USER_ID>;
