import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  getAuthenticateOptions(context: ExecutionContext) {
    const request = context
      .switchToHttp()
      .getRequest<{ query?: { state?: unknown } }>();
    const state =
      typeof request.query?.state === 'string'
        ? request.query.state
        : undefined;

    return state ? { state } : undefined;
  }
}
