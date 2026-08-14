import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AppError } from './errors';

export interface TokenPayload {
  sub: string;
  role: 'USER' | 'ADMIN';
}

export function signToken(payload: TokenPayload): string {
  const options: jwt.SignOptions = {
    expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'],
    issuer: 'seraj-app',
    audience: 'seraj-mobile',
  };
  return jwt.sign(payload, config.jwtSecret, options);
}

export function verifyToken(token: string): TokenPayload & { iat: number; exp: number } {
  try {
    const decoded = jwt.verify(token, config.jwtSecret, {
      issuer: 'seraj-app',
      audience: 'seraj-mobile',
    });
    if (typeof decoded === 'string') throw new Error('invalid payload');
    if (!decoded.sub || (decoded.role !== 'USER' && decoded.role !== 'ADMIN')) {
      throw new Error('invalid claims');
    }
    return decoded as TokenPayload & { iat: number; exp: number };
  } catch {
    throw AppError.unauthorized('INVALID_TOKEN', 'انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرة أخرى.');
  }
}
