import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { IntegrationProviderError } from './integration-provider.error';

@Catch(IntegrationProviderError)
export class IntegrationProviderExceptionFilter implements ExceptionFilter {
  catch(exception: IntegrationProviderError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse();

    if (exception.code === 'needs_reauth') {
      response.status(HttpStatus.UNAUTHORIZED).json({
        statusCode: HttpStatus.UNAUTHORIZED,
        code: 'OAUTH_SESSION_EXPIRED',
        provider: exception.provider,
        message: exception.message,
      });
      return;
    }

    response.status(HttpStatus.SERVICE_UNAVAILABLE).json({
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      code: 'INTEGRATION_PROVIDER_UNAVAILABLE',
      provider: exception.provider,
      message: exception.message,
    });
  }
}
