import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import {
  SocialController,
  SocialOAuthCallbackController,
} from './social.controller';
import { SocialOAuthService } from './social-oauth.service';
import { SocialSyncService } from './social-sync.service';
import { InstagramAdapter } from './adapters/instagram.adapter';
import { FacebookAdapter } from './adapters/facebook.adapter';
import { TikTokAdapter } from './adapters/tiktok.adapter';

@Module({
  imports: [JwtModule.register({})],
  controllers: [SocialController, SocialOAuthCallbackController],
  providers: [
    SocialOAuthService,
    SocialSyncService,
    InstagramAdapter,
    FacebookAdapter,
    TikTokAdapter,
  ],
  exports: [SocialSyncService],
})
export class SocialModule {}
