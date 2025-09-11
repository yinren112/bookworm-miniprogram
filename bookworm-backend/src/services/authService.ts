// src/services/authService.ts
import axios from 'axios';
import * as jwt from 'jsonwebtoken';
import config from '../config'; // <-- Import config
import prisma from '../db';

export async function wxLogin(code: string) {
  const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${config.wxAppId}&secret=${config.wxAppSecret}&js_code=${code}&grant_type=authorization_code`;
  const { data: wxSession } = await axios.get(url);
  
  if (wxSession.errcode) { throw new Error(`WeChat API Error: ${wxSession.errmsg}`); }

  const { openid, unionid } = wxSession;
  
  const user = await prisma.$transaction(async (tx) => {
    let user = null;
    
    if (unionid) {
      user = await tx.user.findUnique({ where: { unionid } });
      
      if (user !== null) {
        if (user.openid !== openid) {
          user = await tx.user.update({
            where: { id: user.id },
            data: { openid }
          });
        }
        return user;
      }
      
      user = await tx.user.findUnique({ where: { openid } });
      
      if (user !== null) {
        user = await tx.user.update({
          where: { id: user.id },
          data: { unionid }
        });
        return user;
      }
      
      user = await tx.user.create({
        data: { openid, unionid }
      });
      return user;
      
    } else {
      user = await tx.user.findUnique({ where: { openid } });
      
      if (user !== null) {
        return user;
      }
      
      user = await tx.user.create({
        data: { openid }
      });
      return user;
    }
  });
  
  const token = jwt.sign({ userId: user.id, openid: user.openid }, config.jwtSecret!, { expiresIn: '7d' });

  return { token, user };
}