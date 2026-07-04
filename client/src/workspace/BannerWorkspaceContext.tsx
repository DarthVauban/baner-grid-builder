import { createContext, useContext, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { emptyBanner, hasBannerContent, normalizeBanner } from '../lib/banner-generator';
import type { BannerData, BannerDraft, SavedBanner, SavedGrid } from '../types/workspace';

interface BannerWorkspaceValue {
  gridName: string;
  shareDescription: string;
  editingGridId: string | null;
  banners: BannerDraft[];
  setGridName: (value: string) => void;
  setShareDescription: (value: string) => void;
  setEditingGridId: (value: string | null) => void;
  updateBanner: (localId: string, patch: Partial<BannerData>) => void;
  addBanner: (banner?: Partial<BannerData>, savedBannerId?: string) => void;
  removeBanner: (localId: string) => void;
  reset: (confirmLoss?: boolean) => boolean;
  loadGrid: (grid: SavedGrid) => void;
  loadSavedBanner: (banner: SavedBanner) => void;
  addSavedBanner: (banner: SavedBanner) => void;
  markBannerSaved: (localId: string, savedBannerId: string) => void;
}

const BannerWorkspaceContext = createContext<BannerWorkspaceValue | null>(null);

let localIdSequence = 0;

function createLocalId(): string {
  localIdSequence += 1;
  return `banner-${Date.now().toString(36)}-${localIdSequence.toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

const draft = (value?: Partial<BannerData>, savedBannerId?: string): BannerDraft => ({
  ...normalizeBanner(value),
  localId: createLocalId(),
  ...(savedBannerId ? { savedBannerId } : {})
});

export function BannerWorkspaceProvider({ children }: PropsWithChildren) {
  const [gridName, setGridName] = useState('');
  const [shareDescription, setShareDescription] = useState('');
  const [editingGridId, setEditingGridId] = useState<string | null>(null);
  const [banners, setBanners] = useState<BannerDraft[]>([draft(emptyBanner())]);

  const value = useMemo<BannerWorkspaceValue>(() => ({
    gridName,
    shareDescription,
    editingGridId,
    banners,
    setGridName,
    setShareDescription,
    setEditingGridId,
    updateBanner: (localId, patch) => setBanners((current) => current.map((item) => item.localId === localId ? { ...item, ...patch } : item)),
    addBanner: (banner, savedBannerId) => setBanners((current) => {
      const next = draft(banner, savedBannerId);
      if (current.length === 1 && !hasBannerContent(current[0])) return [next];
      return [...current, next];
    }),
    removeBanner: (localId) => setBanners((current) => current.length <= 1 ? current : current.filter((item) => item.localId !== localId)),
    reset: (confirmLoss = false) => {
      if (confirmLoss && banners.some(hasBannerContent) && !window.confirm('Очистити поточну сітку та створити нову?')) return false;
      setGridName('');
      setShareDescription('');
      setEditingGridId(null);
      setBanners([draft(emptyBanner())]);
      return true;
    },
    loadGrid: (grid) => {
      setGridName(grid.name || '');
      setShareDescription(grid.shareDescription || '');
      setEditingGridId(grid.isOwner ? grid.id : null);
      setBanners((grid.banners.length ? grid.banners : [emptyBanner()]).map((item) => draft(item)));
    },
    loadSavedBanner: (record) => {
      setGridName('');
      setShareDescription('');
      setEditingGridId(null);
      setBanners([draft(record.banner, record.isOwner ? record.id : undefined)]);
    },
    addSavedBanner: (record) => setBanners((current) => {
      const next = draft(record.banner);
      if (current.length === 1 && !hasBannerContent(current[0])) return [next];
      return [...current, next];
    }),
    markBannerSaved: (localId, savedBannerId) => setBanners((current) => current.map((item) => item.localId === localId ? { ...item, savedBannerId } : item))
  }), [gridName, shareDescription, editingGridId, banners]);

  return <BannerWorkspaceContext.Provider value={value}>{children}</BannerWorkspaceContext.Provider>;
}

export function useBannerWorkspace(): BannerWorkspaceValue {
  const context = useContext(BannerWorkspaceContext);
  if (!context) throw new Error('useBannerWorkspace must be used inside BannerWorkspaceProvider');
  return context;
}
