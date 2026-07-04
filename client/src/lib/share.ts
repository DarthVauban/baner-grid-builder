import { copyToClipboard } from './banner-generator';

export type ShareTarget = 'task' | 'publication';

const shareRoutes: Record<ShareTarget, { path: string; parameter: string }> = {
  task: { path: '/tasks', parameter: 'task' },
  publication: { path: '/tools/blog-publications', parameter: 'publication' }
};

export function buildShareLink(target: ShareTarget, id: string, origin = window.location.origin): string {
  const route = shareRoutes[target];
  const url = new URL(route.path, origin);
  url.searchParams.set(route.parameter, id);
  return url.toString();
}

export function copyShareLink(target: ShareTarget, id: string): Promise<void> {
  return copyToClipboard(buildShareLink(target, id));
}
