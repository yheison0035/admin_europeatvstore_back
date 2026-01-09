import { Role } from '@prisma/client';

export const hasRole = (userRole: Role, allowed: Role[]): boolean => {
  return allowed.includes(userRole);
};
