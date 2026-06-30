export type IntegrationProviderErrorCode =
  | 'provider_unavailable'
  | 'needs_reauth';

function formatProviderName(provider: string) {
  switch (provider.toUpperCase()) {
    case 'GOOGLE':
      return 'Google';
    case 'MICROSOFT':
      return 'Microsoft';
    default:
      return provider;
  }
}

export class IntegrationProviderError extends Error {
  constructor(
    public readonly provider: string,
    public readonly code: IntegrationProviderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'IntegrationProviderError';
  }

  static unavailable(provider: string) {
    return new IntegrationProviderError(
      provider.toUpperCase(),
      'provider_unavailable',
      `Les données ${formatProviderName(provider)} sont temporairement indisponibles.`,
    );
  }

  static needsReauth(provider: string) {
    return new IntegrationProviderError(
      provider.toUpperCase(),
      'needs_reauth',
      `La connexion ${formatProviderName(provider)} a expiré. Reconnectez votre compte pour continuer.`,
    );
  }
}

export function isIntegrationProviderError(
  error: unknown,
): error is IntegrationProviderError {
  return error instanceof IntegrationProviderError;
}
