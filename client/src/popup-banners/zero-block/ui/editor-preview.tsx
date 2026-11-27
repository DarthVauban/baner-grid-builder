'use client';

import { useEffect, useRef } from 'react';
import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { ArrowRight, Menu, Monitor, Search, ShoppingBag, Smartphone, X } from 'lucide-react';
import { IconButton,Switch } from './components';
import { EditorSegments } from './editor-controls';
import './editor-preview.css';

export type PreviewDevice = 'desktop' | 'mobile';
type RenderOverlay = (host: HTMLDivElement) => void | (() => void);

function PreviewStage({ device, renderOverlay,modal }: { device: PreviewDevice; renderOverlay: RenderOverlay;modal:boolean }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => { if (host.current) return renderOverlay(host.current); }, [renderOverlay]);
  return <div className="ui-editor-preview-viewport" data-device={device} role="region" aria-label={device === 'mobile' ? 'Мобільна вітрина' : 'Десктопна вітрина'}>
    <div className="ui-editor-preview-store" aria-hidden={modal||undefined} inert={modal} tabIndex={modal?undefined:0} role={modal?undefined:'region'} aria-label={modal?undefined:'Демонстраційна сторінка магазину'}>
      <div className="ui-editor-preview-announcement">Деталі, що роблять дім вашим · Доставка по Україні</div>
      <div className="ui-editor-preview-store-header"><Menu size={20}/><strong>Дім і деталі<span>HOME COLLECTION</span></strong><div><Search size={20}/><ShoppingBag size={20}/></div></div>
      <div className="ui-editor-preview-store-nav"><span>Новинки</span><span>Для вітальні</span><span>Кухня та декор</span><span>Колекції</span></div>
      <div className="ui-editor-preview-hero"><div><span>ТЕПЛО У ПРОСТИХ РЕЧАХ</span><h3>Затишок<br/>починається з деталей</h3><p>Натуральні текстури, спокійні відтінки<br/>та речі, до яких хочеться повертатись.</p><span className="ui-editor-preview-collection">Осіння колекція <ArrowRight size={17}/></span></div><div className="ui-editor-preview-still-life"><svg viewBox="0 0 240 260" fill="none"><path d="M120 130C100 94 157 76 168 32M121 120C150 94 184 109 198 71M120 117C96 93 81 68 72 40" stroke="currentColor" strokeWidth="3"/><path d="M119 104C93 106 85 80 83 66C106 67 121 81 119 104ZM147 79C144 55 157 36 176 24C182 49 172 68 147 79ZM150 106C163 79 188 79 208 74C197 101 179 111 150 106Z" fill="currentColor"/><path d="M100 130H139L142 162C147 173 167 187 161 223C157 246 82 246 77 223C69 187 92 173 97 162Z" fill="var(--color-card)" stroke="currentColor" strokeWidth="2"/><path d="M100 139C94 190 84 209 97 235M112 137C106 181 101 212 110 238M125 136L129 239M136 139C139 181 153 209 143 237" stroke="currentColor" opacity=".25"/></svg></div></div>
      <div className="ui-editor-preview-store-heading"><h3>Обрано для вашого дому</h3><span>Уся колекція →</span></div>
      <div className="ui-editor-preview-products">{['Керамічна ваза', 'Лляний плед', 'Декоративна чаша', 'Свічка для дому'].map((name, index) => <div key={name}><div className="ui-editor-preview-product-art" data-art={index}><ShoppingBag size={52} strokeWidth={1}/></div><strong>{name}</strong><span>{[890, 1290, 640, 420][index]} ₴</span></div>)}</div>
    </div>
    <div ref={host} className="ui-editor-preview-overlay"/>
  </div>;
}

export function EditorPreview({ open, onOpenChange, title, device, onDeviceChange, renderOverlay,modal=true,timerExpired=false,onTimerExpiredChange }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string;
  device: PreviewDevice; onDeviceChange: (device: PreviewDevice) => void; renderOverlay: RenderOverlay;modal?:boolean;timerExpired?:boolean;onTimerExpiredChange?:(value:boolean)=>void;
}) {
  return <BaseDialog.Root open={open} onOpenChange={onOpenChange}><BaseDialog.Portal><BaseDialog.Backdrop className="ui-backdrop"/><BaseDialog.Popup className="ui-editor-preview">
    <div className="ui-editor-preview-header"><div><span>Перегляд банера</span><BaseDialog.Title>{title}</BaseDialog.Title></div><EditorSegments surface="light" label="Пристрій прев’ю" value={device} onValueChange={value => onDeviceChange(value as PreviewDevice)} items={[{value:'desktop',label:'Комп’ютер',icon:<Monitor size={17}/>},{value:'mobile',label:'Телефон',icon:<Smartphone size={17}/>} ]}/><BaseDialog.Close render={<IconButton label="Закрити перегляд" variant="secondary" icon={<X size={20}/>}/>}/></div>
    <BaseDialog.Description className="ui-editor-preview-description">Демонстраційний магазин · перевірте вигляд і дії банера перед публікацією.</BaseDialog.Description>
    {onTimerExpiredChange?<Switch label="Час вичерпано" checked={timerExpired} onCheckedChange={onTimerExpiredChange}/>:null}
    <div className="ui-editor-preview-stage"><PreviewStage device={device} renderOverlay={renderOverlay} modal={modal}/></div>
  </BaseDialog.Popup></BaseDialog.Portal></BaseDialog.Root>;
}
