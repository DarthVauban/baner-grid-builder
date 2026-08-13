import { env } from '../../config/env.js';

export function mobileWorkspaceMetadata({ includeApiBaseUrl = true } = {}) {
  const workspace = {
    deploymentId: env.mobileDeploymentId,
    environment: env.mobileEnvironment,
    displayName: env.mobileDeploymentName,
    webOrigin: env.mobilePublicOrigin
  };
  if (includeApiBaseUrl) workspace.apiBaseUrl = env.mobileApiBaseUrl;
  return workspace;
}

export function mobilePairingQrPayload(token) {
  if (!env.mobileMultiAccountPairingEnabled) return `mtworkspace://pair?token=${token}`;
  const params = new URLSearchParams({
    v: '2',
    deploymentId: env.mobileDeploymentId,
    issuer: env.mobilePublicOrigin,
    token
  });
  return `mtworkspace://pair?${params.toString()}`;
}

export function mobileQrLoginPayload(challengeId, scanToken) {
  const params = new URLSearchParams({
    v: '1',
    deploymentId: env.mobileDeploymentId,
    issuer: env.mobilePublicOrigin,
    challengeId,
    token: scanToken
  });
  return `mtworkspace://login?${params.toString()}`;
}
