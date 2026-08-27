import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// Cliente de la tienda online autenticado (lo pone CustomerJwtGuard en la
// request). Distinto del usuario del staff (@Req().user).
export const CurrentCustomer = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.customer;
  },
);
