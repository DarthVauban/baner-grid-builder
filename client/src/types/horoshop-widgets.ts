export type HoroshopWidgetRelease = {
  id: string;
  buildSha: string;
  storeDomain: string;
  publishedAt: string;
  publisherName: string;
  embedCode: string;
};

export type HoroshopWidgetReleases = {
  releases: HoroshopWidgetRelease[];
  canPublish: boolean;
};
