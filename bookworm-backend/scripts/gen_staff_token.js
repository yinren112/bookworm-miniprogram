const { createSigner } = require("fast-jwt");
const signer = createSigner({
  key: "development-secret-key-change-in-production",
  expiresIn: "7d",
});
const token = signer({
  userId: 999,
  openid: "admin-openid",
  role: "STAFF",
});
console.log(token);
