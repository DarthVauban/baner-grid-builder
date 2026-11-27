'use client';

import { useRef, type ComponentProps, type MouseEvent, type ReactElement, type ReactNode } from 'react';
import { ContextMenu as BaseContextMenu } from '@base-ui/react/context-menu';
import { ChevronRight } from 'lucide-react';
import './context-menu.css';

export type ContextMenuItem = { label: string; icon?: ReactNode; shortcut?: string; disabled?: boolean; onClick?: () => void; children?: readonly ContextMenuItem[] };
function Items({ items }: { items: readonly ContextMenuItem[] }) {
  return items.map((item, index) => item.children ? <BaseContextMenu.SubmenuRoot key={index}>
    <BaseContextMenu.SubmenuTrigger className="ui-menu-item" disabled={item.disabled} openOnHover><span aria-hidden="true">{item.icon}</span><span>{item.label}</span><ChevronRight className="ui-context-menu-tail" size={15}/></BaseContextMenu.SubmenuTrigger>
    <BaseContextMenu.Portal><BaseContextMenu.Positioner className="ui-positioner" side="right" sideOffset={4} align="start" collisionPadding={8}><BaseContextMenu.Popup className="ui-popup ui-menu" aria-label={item.label}><Items items={item.children}/></BaseContextMenu.Popup></BaseContextMenu.Positioner></BaseContextMenu.Portal>
  </BaseContextMenu.SubmenuRoot> : <BaseContextMenu.Item key={index} className="ui-menu-item" disabled={item.disabled} onClick={item.onClick}><span aria-hidden="true">{item.icon}</span><span>{item.label}</span>{item.shortcut ? <kbd className="ui-context-menu-tail">{item.shortcut}</kbd> : null}</BaseContextMenu.Item>);
}
/** The child is a structural surface; the shared primitive owns pointer/keyboard menu behavior. */
export function ContextMenu({ children, items, onContextMenu, finalFocus }: {
  children: ReactElement; items: readonly ContextMenuItem[]; onContextMenu?: (event: MouseEvent<HTMLDivElement>) => void;
  finalFocus?: ComponentProps<typeof BaseContextMenu.Popup>['finalFocus'];
}) {
  const returnAfterClose = useRef(false);
  return <BaseContextMenu.Root onOpenChange={(open, details) => { if (!open) returnAfterClose.current = details.reason !== 'outside-press'; }} onOpenChangeComplete={open => {
    // Base UI chooses the first tabbable child of a non-tabbable ref target.
    // Restore the literal surface ref instead; outside clicks keep their target.
    if (!open && returnAfterClose.current && typeof finalFocus === 'object') finalFocus?.current?.focus({ preventScroll: true });
  }}><BaseContextMenu.Trigger render={children} onContextMenu={onContextMenu}/><BaseContextMenu.Portal><BaseContextMenu.Positioner className="ui-positioner" collisionPadding={8}><BaseContextMenu.Popup className="ui-popup ui-menu" aria-label="Дії редактора" finalFocus={typeof finalFocus === 'object' ? false : finalFocus}><Items items={items}/></BaseContextMenu.Popup></BaseContextMenu.Positioner></BaseContextMenu.Portal></BaseContextMenu.Root>;
}
