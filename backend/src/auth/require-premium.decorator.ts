import { SetMetadata } from '@nestjs/common';

export const REQUIRE_PREMIUM_KEY = 'requirePremium';
export const RequirePremium = () => SetMetadata(REQUIRE_PREMIUM_KEY, true);
