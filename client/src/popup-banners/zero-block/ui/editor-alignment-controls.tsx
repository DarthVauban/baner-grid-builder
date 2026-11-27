'use client';

import {
  AlignHorizontalJustifyStart, AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd,
  AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd,
} from 'lucide-react';
import { IconButton, Tooltip } from './components';

const commands = [
  { value: 'left', label: 'До лівого краю', Icon: AlignHorizontalJustifyStart },
  { value: 'center', label: 'До центру по горизонталі', Icon: AlignHorizontalJustifyCenter },
  { value: 'right', label: 'До правого краю', Icon: AlignHorizontalJustifyEnd },
  { value: 'top', label: 'До верхнього краю', Icon: AlignVerticalJustifyStart },
  { value: 'middle', label: 'До центру по вертикалі', Icon: AlignVerticalJustifyCenter },
  { value: 'bottom', label: 'До нижнього краю', Icon: AlignVerticalJustifyEnd },
] as const;

export type EditorAlignment = (typeof commands)[number]['value'];

export function EditorAlignmentControls({ onAlign, disabled = false, label = 'Вирівнювання на полотні' }: {
  onAlign: (alignment: EditorAlignment) => void; disabled?: boolean; label?: string;
}) {
  return <div className="ui-editor-alignment-controls" role="group" aria-label={label}>
    {commands.map(({ value, label: commandLabel, Icon }) => <Tooltip key={value} content={commandLabel}>
      <IconButton label={commandLabel} variant="secondary" disabled={disabled}
        icon={<Icon size={22} strokeWidth={1.75}/>} onClick={() => onAlign(value)}/>
    </Tooltip>)}
  </div>;
}
