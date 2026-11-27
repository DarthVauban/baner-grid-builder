'use client';

import { useId, useState } from 'react';
import { Popover } from '@base-ui/react/popover';
import { ChevronDown, X } from 'lucide-react';
import { IconButton } from './components';

export type ActionChoice = { value: string; label: string; disabled?: boolean; badge?: string; reason?: string };
export function ActionChoiceList({ label, options, value, onValueChange, presentation = 'list' }: {
  label: string; options: readonly ActionChoice[]; value: string; onValueChange: (value: string) => void; presentation?: 'list' | 'popover';
}) {
  const baseId = useId();
  const [open, setOpen] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const choices = <div className="ui-action-choices" role="group" aria-label={label}>
    {presentation === 'list' ? <span className="ui-label">{label}</span> : null}
    {options.map((option, index) => {
      const explanationId = `${baseId}-${index}`;
      const shown = option.disabled && open === option.value;
      return <div key={option.value} className="ui-action-choice-wrap">
        <button type="button" className="ui-action-choice" aria-pressed={!option.disabled && value === option.value}
          aria-disabled={option.disabled || undefined} aria-describedby={option.disabled ? explanationId : undefined}
          onPointerEnter={(event) => option.disabled && event.pointerType !== 'touch' && setOpen(option.value)}
          onPointerLeave={(event) => event.pointerType !== 'touch' && setOpen(null)}
          onFocus={() => option.disabled && setOpen(option.value)} onBlur={() => setOpen(null)}
          onClick={() => { if (option.disabled) { setOpen(option.value); return; } setOpen(null); onValueChange(option.value); setExpanded(false); }}>
          <span>{option.label}</span>{option.badge ? <span className="ui-action-choice-badge">{option.badge}</span> : null}
        </button>
        {option.disabled ? <span id={explanationId} className="ui-action-choice-reason" role={shown ? 'tooltip' : undefined} data-open={shown || undefined}>{option.reason}</span> : null}
      </div>;
    })}
  </div>;
  if (presentation === 'list') return choices;
  return <div className="ui-field"><span id={`${baseId}-label`} className="ui-label">{label}</span><Popover.Root open={expanded} onOpenChange={setExpanded}><Popover.Trigger className="ui-input ui-select-trigger" aria-labelledby={`${baseId}-label ${baseId}-value`}><span id={`${baseId}-value`}>{options.find(option => option.value === value)?.label || 'Оберіть дію'}</span><ChevronDown size={15} aria-hidden="true"/></Popover.Trigger><Popover.Portal><Popover.Positioner className="ui-positioner" sideOffset={8} align="start"><Popover.Popup className="ui-popup ui-action-popup"><div className="ui-action-popup-heading"><Popover.Title>{label}</Popover.Title><Popover.Close render={<IconButton variant="ghost" size="sm" label="Закрити список дій" icon={<X size={16}/>}/>}/></div>{choices}</Popover.Popup></Popover.Positioner></Popover.Portal></Popover.Root></div>;
}
