import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

interface PremiumUser {
  isPremium: boolean;
  role: string;
}

@Injectable()
export class PremiumGuard extends JwtAuthGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    await super.canActivate(context);

    const request = context.switchToHttp().getRequest<{ user: PremiumUser }>();
    const user = request.user;

    if (user.role === 'ADMIN' || user.isPremium) {
      return true;
    }

    throw new ForbiddenException(
      'This feature requires a Premium subscription.',
    );
  }
}
