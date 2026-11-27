"use client";

import {
  Fragment,
  cloneElement,
  isValidElement,
  useId,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import { StyledSelect } from "@workspace/components/StyledSelect";
import { PopupToggle } from "@workspace/components/PopupToggle";
import { PaintInput } from "./paint-input";
import { SavedPaintSwatches } from "./paint-library";
import { ColorArea } from "./color-area";
import { hexToHsv, hsvToHex, type ColorSelection } from "./color-utils";
import { Accordion as BaseAccordion } from "@base-ui/react/accordion";
import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { Menu as BaseMenu } from "@base-ui/react/menu";
import { Popover as BasePopover } from "@base-ui/react/popover";
import { Slider as BaseSlider } from "@base-ui/react/slider";
import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Layers,
  LoaderCircle,
  Minus,
  Search,
  X,
} from "lucide-react";

function cx(...values: (string | false | undefined)[]) {
  return values.filter(Boolean).join(" ");
}

export type Tone = "neutral" | "success" | "warning" | "danger" | "info";
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "chrome" | "inverse";
export type ControlSize = "sm" | "md" | "lg";
export type DemoState = "hover" | "focus" | "active";

export type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ControlSize;
  loading?: boolean;
  icon?: ReactNode;
  layout?: "center" | "navigation";
  "data-demo-state"?: DemoState;
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  layout = "center",
  icon,
  className,
  disabled,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={cx("button ui-button", `ui-button--${variant}`, `button--${variant === "primary" ? "primary" : variant === "danger" ? "danger" : "secondary"}`, `ui-button--${size}`, layout === "navigation" && "ui-button--navigation", className)}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? <LoaderCircle className="ui-spin" size={17} aria-hidden="true" /> : icon ? <span className="ui-button-icon" aria-hidden="true">{icon}</span> : null}
      {children !== undefined && children !== null ? <span className="ui-button-label">{children}</span> : null}
      {loading ? <span className="ui-sr-only"> — виконується</span> : null}
    </button>
  );
}

export function IconButton({
  label,
  icon,
  className,
  ...props
}: Omit<ButtonProps, "children" | "icon"> & { label: string; icon: ReactNode }) {
  return <Button {...props} className={cx("ui-icon-button", className)} aria-label={label} title={label} icon={icon} />;
}

export function AppLink({
  variant = "text",
  className,
  children,
  href,
  ...props
}: Omit<ComponentProps<typeof Link>, "to"> & { href: string; variant?: "text" | "primary" | "secondary" | "chrome" | "inverse" }) {
  const styling = cx("ui-link", variant !== "text" && `button ui-button button--${variant === "primary" ? "primary" : "secondary"}`, className);
  if (href.startsWith("https://")) return <a {...props} href={href} className={styling}>{children}</a>;
  return <Link {...props} to={href} className={styling}>{children}</Link>;
}

type LabelledChild = { id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean | "true" | "false"; "data-validation"?: string };

export function Field({
  label,
  hint,
  error,
  success,
  children,
  id,
  className,
}: { label: ReactNode; hint?: ReactNode; error?: ReactNode; success?: ReactNode; children: ReactElement; id?: string; className?: string }) {
  const generatedId = useId();
  const child = isValidElement<LabelledChild>(children) ? children : null;
  const controlId = id ?? child?.props.id ?? generatedId;
  const description = error ?? success ?? hint;
  const descriptionId = description ? `${controlId}-description` : undefined;
  return (
    <div className={cx("ui-field", className)} data-validation={error ? "error" : success ? "success" : undefined}>
      <label className="ui-label" htmlFor={controlId}>{label}</label>
      {child ? cloneElement(child, {
        id: controlId,
        "aria-describedby": [child.props["aria-describedby"], descriptionId].filter(Boolean).join(" ") || undefined,
        "aria-invalid": error ? true : child.props["aria-invalid"],
        "data-validation": error ? "error" : success ? "success" : undefined,
      }) : children}
      {description ? <p className={cx("ui-field-description", !!error && "ui-text-danger", !!success && !error && "ui-text-success")} id={descriptionId}>{error ? <AlertCircle size={14} aria-hidden="true" /> : success ? <CheckCircle2 size={14} aria-hidden="true" /> : null}{description}</p> : null}
    </div>
  );
}

export type TextInputProps = Omit<ComponentProps<"input">, "size"> & { "data-demo-state"?: DemoState; "data-validation"?: "error" | "success" };

export function TextInput({ className, ...props }: TextInputProps) {
  return <input {...props} className={cx("ui-input", className)} />;
}

export function NumberInput(props: TextInputProps) {
  return <TextInput {...props} type="number" />;
}

export function TextArea({ className, rows = 3, ...props }: ComponentProps<"textarea"> & { "data-demo-state"?: DemoState; "data-validation"?: "error" | "success" }) {
  return <textarea {...props} rows={rows} className={cx("ui-input ui-textarea", className)} />;
}

export function SearchInput({ className, ...props }: TextInputProps) {
  return <div className="ui-search"><Search size={17} aria-hidden="true" /><TextInput {...props} type="search" className={cx("ui-search-input", className)} /></div>;
}

export type SelectOption = { value: string; label: string; disabled?: boolean; icon?: ReactNode };
export type SelectProps = {
  label: string;
  options: readonly SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  error?: string;
  hint?: string;
  className?: string;
  searchable?: boolean;
};

export function Select({ label, options, value, defaultValue, onValueChange, disabled, placeholder = "Оберіть значення", error, hint, className, searchable }: SelectProps) {
  const [local, setLocal] = useState(defaultValue ?? "");
  const descriptionId = useId();
  return <div className={cx("ui-field", className)}>
    <span className="ui-label">{label}</span>
    <StyledSelect ariaLabel={label} ariaInvalid={!!error || undefined} ariaDescribedBy={error || hint ? descriptionId : undefined}
      value={value ?? local} options={[...options]} disabled={disabled} placeholder={placeholder} searchable={searchable} compact
      onChange={(next) => { setLocal(next); onValueChange?.(next); }} />
    {error || hint ? <p id={descriptionId} className={cx("ui-field-description", !!error && "ui-text-danger")}>{error ?? hint}</p> : null}
  </div>;
}

type CheckedProps = { label: ReactNode; checked?: boolean; defaultChecked?: boolean; onCheckedChange?: (checked: boolean) => void; disabled?: boolean; className?: string; description?: ReactNode };

export function Checkbox({ label, checked, defaultChecked, onCheckedChange, disabled, className, indeterminate = false, labelHidden = false, description }: CheckedProps & { indeterminate?: boolean; labelHidden?: boolean }) {
  const id = useId();
  return <label className={cx("ui-choice", className)} data-disabled={disabled || undefined}><BaseCheckbox.Root className="ui-checkbox" checked={checked} defaultChecked={defaultChecked} onCheckedChange={onCheckedChange} disabled={disabled} indeterminate={indeterminate} aria-describedby={description ? id : undefined}><BaseCheckbox.Indicator>{indeterminate ? <Minus size={14} aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}</BaseCheckbox.Indicator></BaseCheckbox.Root><span className={labelHidden ? "ui-sr-only" : "ui-choice-text"}>{label}{description ? <span className="ui-choice-description" id={id}>{description}</span> : null}</span></label>;
}

export function Switch({ label, checked, defaultChecked, onCheckedChange, disabled, className, description }: CheckedProps) {
  const [local, setLocal] = useState(defaultChecked ?? false);
  return <div className={className}><PopupToggle checked={checked ?? local} label={label} description={description}
    role="switch" disabled={disabled} onChange={(next) => { setLocal(next); onCheckedChange?.(next); }} /></div>;
}

export function Slider({ label, value, defaultValue = 50, onValueChange, onInteractionStart, onInteractionEnd, compact = false, min = 0, max = 100, step = 1, disabled, className }: { label: string; value?: number; defaultValue?: number; onValueChange?: (value: number) => void; onInteractionStart?: () => void; onInteractionEnd?: () => void; compact?: boolean; min?: number; max?: number; step?: number; disabled?: boolean; className?: string }) {
  return <BaseSlider.Root className={cx("ui-slider", className)} value={value} defaultValue={defaultValue} onValueChange={(next) => { onInteractionStart?.(); onValueChange?.(Array.isArray(next) ? next[0] : next); }} onValueCommitted={() => onInteractionEnd?.()} min={min} max={max} step={step} disabled={disabled}><div className={compact ? "ui-sr-only" : "ui-slider-heading"}><BaseSlider.Label className="ui-label">{label}</BaseSlider.Label><BaseSlider.Value className="ui-slider-value" /></div><BaseSlider.Control className="ui-slider-control"><BaseSlider.Track className="ui-slider-track"><BaseSlider.Indicator className="ui-slider-indicator" /><BaseSlider.Thumb className="ui-slider-thumb" aria-label={label} /></BaseSlider.Track></BaseSlider.Control></BaseSlider.Root>;
}

export type ColorInputProps = {
  solidOnly?: boolean;
  label: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
  disabled?: boolean;
  error?: string;
  hint?: string;
  className?: string;
};

export function normalizeHexColor(value: string) {
  const hex = value.trim();
  if (!/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(hex)) return null;
  const digits = hex.slice(1);
  return `#${digits.length <= 4 ? [...digits].map((digit) => digit + digit).join("") : digits}`.toUpperCase();
}

export function ColorInput(props: ColorInputProps) { return props.solidOnly ? <SolidColorInput {...props}/> : <PaintInput {...props}/>; }

export function SolidColorInput({ embedded = false, onDraftValidityChange, label, value, defaultValue = "#403C35", onValueChange, onInteractionStart, onInteractionEnd, disabled = false, error, hint, className }: ColorInputProps & {embedded?:boolean;onDraftValidityChange?:(invalid:boolean)=>void}) {
  const id = useId();
  const [pickerOpen, setPickerOpen] = useState(false);
  const pointer = useRef<number | null>(null);
  const endTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endCallback = useRef(onInteractionEnd);
  useEffect(() => { endCallback.current = onInteractionEnd; }, [onInteractionEnd]);
  const finishInteraction = useCallback(() => {
    if (endTimer.current !== null) { clearTimeout(endTimer.current); endTimer.current = null; }
    if (pointer.current === null) return;
    pointer.current = null; endCallback.current?.();
  }, []);
  useEffect(() => {
    // Complete after child/document value handlers in the same pointer event.
    // Capture schedules a fallback for consumers that stop propagation.
    const end = (event: globalThis.PointerEvent) => { if (pointer.current === event.pointerId) { if (endTimer.current !== null) clearTimeout(endTimer.current); endTimer.current = setTimeout(finishInteraction, 0); } };
    const release = (event: globalThis.PointerEvent) => { if (pointer.current === event.pointerId) finishInteraction(); };
    const blur = () => { finishInteraction(); setPickerOpen(false); };
    window.addEventListener('pointerup', end, true); window.addEventListener('pointercancel', end, true);
    window.addEventListener('pointerup', release); window.addEventListener('pointercancel', release);
    window.addEventListener('lostpointercapture', end, true); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('pointerup', end, true); window.removeEventListener('pointercancel', end, true); window.removeEventListener('pointerup', release); window.removeEventListener('pointercancel', release); window.removeEventListener('lostpointercapture', end, true); window.removeEventListener('blur', blur); finishInteraction(); };
  }, [finishInteraction]);
  useEffect(() => { if (disabled) finishInteraction(); }, [disabled, finishInteraction]);
  const [state, setState] = useState(() => {
    const color = normalizeHexColor(value ?? defaultValue) ?? "#403C35";
    return { color, draft: normalizeHexColor(value ?? defaultValue) ?? value ?? defaultValue, sourceValue: value, selection: hexToHsv(color) };
  });
  // Preserve a draft echoed by the controlled callback; synchronize unrelated external updates.
  if (value !== state.sourceValue) {
    const nextColor = value === undefined ? state.color : normalizeHexColor(value);
    const isOwnEcho = nextColor !== null && nextColor === normalizeHexColor(state.draft);
    setState({
      color: nextColor ?? state.color,
      draft: isOwnEcho || value === undefined ? state.draft : nextColor ?? value,
      sourceValue: value,
      selection: nextColor && !isOwnEcho ? hexToHsv(nextColor, state.selection) : state.selection,
    });
  }
  const invalidDraft = normalizeHexColor(state.draft) === null;
  useEffect(()=>{onDraftValidityChange?.(invalidDraft);},[invalidDraft,onDraftValidityChange]);
  const validationError = error ?? (invalidDraft ? "Введіть колір у форматі #RGB, #RGBA, #RRGGBB або #RRGGBBAA." : undefined);
  const description = validationError ?? hint;
  const selection = value !== undefined && normalizeHexColor(state.draft) !== state.color ? hexToHsv(state.color, state.selection) : state.selection;

  function changeDraft(draft: string, normalize = false, intent?: ColorSelection) {
    if (disabled) return;
    const validColor = normalizeHexColor(draft);
    setState((current) => ({
      ...current,
      draft: normalize && validColor ? validColor : draft,
      color: validColor && value === undefined ? validColor : current.color,
      selection: validColor ? intent ?? hexToHsv(validColor, current.selection) : current.selection,
    }));
    if (validColor) onValueChange?.(validColor);
  }

  function changeSelection(next: ColorSelection) {
    changeDraft(hsvToHex(next, state.color.length === 9), true, next);
  }

  function canonicalizeDraft() {
    const canonical = normalizeHexColor(state.draft);
    if (canonical) setState((current) => ({ ...current, draft: canonical }));
  }

  const controls = <>
          <div className="ui-classic-color-controls" onPointerDownCapture={event => {
            if (endTimer.current !== null) finishInteraction();
            if (disabled || pointer.current !== null || (event.pointerType !== 'touch' && event.button !== 0)) return;
            pointer.current = event.pointerId; onInteractionStart?.();
          }}>
            <ColorArea hue={selection.hue} saturation={selection.saturation} value={selection.brightness} disabled={disabled} onValueChange={(saturation, brightness) => changeSelection({ ...selection, saturation, brightness })}/>
            <Slider className="ui-color-hue" label="Відтінок" value={Math.round(selection.hue) % 360} min={0} max={359} onValueChange={hue => changeSelection({ ...selection, hue })} disabled={disabled}/>
            <div className="ui-color-alpha" style={{ "--color-alpha-rgb": state.color.slice(0, 7) } as CSSProperties}><Slider label="Непрозорість кольору" value={Math.round(selection.alpha)} min={0} max={100} onValueChange={alpha => changeSelection({ ...selection, alpha })} disabled={disabled}/></div>
          </div>
          <div className="ui-color-picker-preview"><span className="ui-color-swatch"><span style={{ backgroundColor: state.color }} /></span><code>{state.color}</code></div>
  </>;
  if (embedded) return <div className="ui-paint-color-editor">{controls}<Field label={label}><TextInput value={state.draft} onChange={event=>changeDraft(event.target.value)} onBlur={canonicalizeDraft} aria-invalid={invalidDraft||undefined} disabled={disabled}/></Field>{validationError?<p className="ui-field-description ui-text-danger" role="alert">{validationError}</p>:null}</div>;
  return <div className={cx("ui-field", "ui-color-field", className)} data-disabled={disabled || undefined}>
    <label className="ui-label" htmlFor={id}>{label}</label>
    <div className="ui-color-control" data-invalid={!!validationError || undefined}>
      <BasePopover.Root open={pickerOpen} onOpenChange={open => { setPickerOpen(open); if (!open) finishInteraction(); }}>
        <BasePopover.Trigger render={<IconButton className="ui-color-trigger" label={`Відкрити палітру: ${label}`} variant="ghost" disabled={disabled} icon={<span className="ui-color-swatch"><span style={{ backgroundColor: state.color }} /></span>} />} />
        <BasePopover.Portal><BasePopover.Positioner className="ui-positioner" sideOffset={8} align="start" collisionPadding={12} collisionAvoidance={{ side: "shift", align: "shift" }}><BasePopover.Popup className="ui-popup ui-color-picker" data-color-picker="">
          <div className="ui-color-picker-heading"><BasePopover.Title>Палітра: {label}</BasePopover.Title><BasePopover.Close render={<IconButton label="Закрити палітру" icon={<X size={16} />} variant="ghost" />} /></div>
          <BasePopover.Description className="ui-field-description">Оберіть колір на палітрі та налаштуйте його прозорість.</BasePopover.Description>
          {controls}
          <SavedPaintSwatches solidOnly value={state.color} onApply={color=>changeDraft(color,true)} disabled={disabled} invalid={invalidDraft||!!error}/>
        </BasePopover.Popup></BasePopover.Positioner></BasePopover.Portal>
      </BasePopover.Root>
      <input id={id} className="ui-color-text" type="text" value={state.draft} spellCheck={false} autoComplete="off" autoCapitalize="off" placeholder="#RRGGBB" aria-invalid={!!validationError || undefined} aria-describedby={description ? `${id}-description` : undefined} disabled={disabled} onChange={(event) => changeDraft(event.target.value)} onBlur={canonicalizeDraft} onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          canonicalizeDraft();
        }
      }} />
    </div>
    {description ? <p id={`${id}-description`} className={cx("ui-field-description", !!validationError && "ui-text-danger")} role={validationError ? "alert" : undefined}>{validationError ? <AlertCircle size={14} aria-hidden="true" /> : null}{description}</p> : null}
  </div>;
}

export function Badge({ children, tone = "neutral", dot = false, surface = "light", className }: { children: ReactNode; tone?: Tone; dot?: boolean; surface?: "light" | "dark"; className?: string }) {
  return <span className={cx("ui-badge", `ui-badge--${tone}`, surface === "dark" && "ui-badge--on-dark", className)}>{dot ? <span className="ui-status-dot" aria-hidden="true" /> : null}{children}</span>;
}

export function Card({ className, tone = "light", padding = "default", children, ...props }: ComponentProps<"div"> & { tone?: "light" | "inset" | "dark"; padding?: "default" | "none" }) {
  return <div {...props} className={cx("ui-card", `ui-card--${tone}`, padding === 'none' && 'ui-card--flush', className)}>{children}</div>;
}

export function Panel({ className, tone = "dark", children, ...props }: ComponentProps<"div"> & { tone?: "light" | "inset" | "dark" }) {
  return <div {...props} className={cx("ui-panel", `ui-panel--${tone}`, className)}>{children}</div>;
}

export type TabItem = { value: string; label: ReactNode; content: ReactNode; disabled?: boolean };
export function Tabs({ items, defaultValue, value, onValueChange, label = "Вкладки", className }: { items: readonly TabItem[]; defaultValue?: string; value?: string; onValueChange?: (value: string) => void; label?: string; className?: string }) {
  return <BaseTabs.Root className={cx("ui-tabs", className)} value={value} defaultValue={defaultValue ?? items[0]?.value} onValueChange={(next) => onValueChange?.(String(next))}><BaseTabs.List className="ui-tabs-list" aria-label={label}>{items.map((item) => <BaseTabs.Tab key={item.value} className="ui-tab" value={item.value} disabled={item.disabled}>{item.label}</BaseTabs.Tab>)}</BaseTabs.List>{items.map((item) => <BaseTabs.Panel key={item.value} value={item.value} className="ui-tab-panel">{item.content}</BaseTabs.Panel>)}</BaseTabs.Root>;
}

export function Dialog({ trigger, title, description, children, open, onOpenChange, size = 'default', footer, compactHeader = false }: { trigger?: ReactElement; title: ReactNode; description?: ReactNode; children?: ReactNode; open?: boolean; onOpenChange?: (open: boolean) => void; size?: 'default' | 'wide' | 'workspace'; footer?: ReactNode; compactHeader?: boolean }) {
  return <BaseDialog.Root open={open} onOpenChange={onOpenChange}>{trigger ? <BaseDialog.Trigger render={trigger} /> : null}<BaseDialog.Portal><BaseDialog.Backdrop className="ui-backdrop" /><BaseDialog.Popup className={cx('ui-dialog',size !== 'default' && 'ui-dialog--wide', size === 'workspace' && 'ui-dialog--workspace', compactHeader && 'ui-dialog--compact-header')}><BaseDialog.Close className="ui-dialog-x" aria-label="Закрити діалог"><X size={19} aria-hidden="true" /></BaseDialog.Close>{!compactHeader ? <div className="ui-overlay-emblem"><Layers size={22} aria-hidden="true" /></div> : null}<BaseDialog.Title className="ui-overlay-title">{title}</BaseDialog.Title>{description ? <BaseDialog.Description className="ui-overlay-description">{description}</BaseDialog.Description> : null}<div className="ui-dialog-content">{children}</div><div className="ui-dialog-actions">{footer ?? <BaseDialog.Close render={<Button variant="secondary">Закрити</Button>} />}</div></BaseDialog.Popup></BaseDialog.Portal></BaseDialog.Root>;
}

export type MenuItem = { label: string; icon?: ReactNode; disabled?: boolean; onClick?: () => void; tone?: "default" | "danger" };
export function Menu({ trigger, items, finalFocus }: { trigger: ReactElement; items: readonly MenuItem[]; finalFocus?: ComponentProps<typeof BaseMenu.Popup>["finalFocus"] }) {
  return <BaseMenu.Root><BaseMenu.Trigger render={trigger} /><BaseMenu.Portal><BaseMenu.Positioner className="ui-positioner" sideOffset={7} align="start"><BaseMenu.Popup className="ui-popup ui-menu" finalFocus={finalFocus}>{items.map((item, index) => <BaseMenu.Item key={`${item.label}-${index}`} className={cx("ui-menu-item", item.tone === "danger" && "ui-text-danger")} disabled={item.disabled} onClick={item.onClick}>{item.icon ? <span aria-hidden="true">{item.icon}</span> : null}<span>{item.label}</span></BaseMenu.Item>)}</BaseMenu.Popup></BaseMenu.Positioner></BaseMenu.Portal></BaseMenu.Root>;
}

export function Popover({ trigger, title, description, children, open, onOpenChange, size = 'default' }: { trigger: ReactElement; title: ReactNode; description?: ReactNode; children?: ReactNode; open?: boolean; onOpenChange?: (open: boolean) => void; size?: 'default' | 'compact' }) {
  return <BasePopover.Root open={open} onOpenChange={onOpenChange}><BasePopover.Trigger render={trigger} /><BasePopover.Portal><BasePopover.Positioner className="ui-positioner" sideOffset={10} align="start" positionMethod={size === 'compact' ? 'fixed' : undefined} sticky={size === 'compact'} collisionAvoidance={size === 'compact' ? { side: 'shift', align: 'shift' } : undefined}><BasePopover.Popup className={`ui-popup ui-popover${size === 'compact' ? ' ui-popover-compact' : ''}`}><BasePopover.Title className="ui-popover-title">{title}</BasePopover.Title>{description ? <BasePopover.Description className="ui-overlay-description">{description}</BasePopover.Description> : null}{size === 'compact' ? <div className="ui-popover-body">{children}</div> : children}<BasePopover.Close className="ui-popover-close" aria-label={size === 'compact' ? 'Закрити панель' : 'Закрити підказку'}><X size={16} aria-hidden="true" /></BasePopover.Close></BasePopover.Popup></BasePopover.Positioner></BasePopover.Portal></BasePopover.Root>;
}

export function Tooltip({ content, children }: { content: ReactNode; children: ReactElement }) {
  const tooltipId = useId();
  const [open, setOpen] = useState(false);
  const childDescription = (children.props as { "aria-describedby"?: string })["aria-describedby"];
  const describedBy = [childDescription, open ? tooltipId : undefined].filter(Boolean).join(" ") || undefined;
  return <BaseTooltip.Provider delay={200}><BaseTooltip.Root open={open} onOpenChange={setOpen}><BaseTooltip.Trigger render={children} aria-describedby={describedBy} /><BaseTooltip.Portal><BaseTooltip.Positioner className="ui-positioner" sideOffset={8}><BaseTooltip.Popup id={tooltipId} role="tooltip" className="ui-tooltip">{content}</BaseTooltip.Popup></BaseTooltip.Positioner></BaseTooltip.Portal></BaseTooltip.Root></BaseTooltip.Provider>;
}

export type TableColumn<Row> = { key: string; header: ReactNode; render?: (row: Row) => ReactNode };
export type DataTableExpansion<Row> = { ids: readonly string[]; onToggle: (row: Row) => void; label: (row: Row) => string; render: (row: Row) => ReactNode };
export function DataTable<Row extends { id: string }>({ columns, rows, caption, className, onRowClick, rowLabel, selectedIds, expansion, variant = 'default' }: { columns: readonly TableColumn<Row>[]; rows: readonly Row[]; caption: string; className?: string; onRowClick?: (row: Row) => void; rowLabel?: (row: Row) => string; selectedIds?: readonly string[]; expansion?: DataTableExpansion<Row>; variant?: 'default' | 'compact' | 'embedded' | 'settings' }) {
  const scope = useId();
  const activate = onRowClick ?? expansion?.onToggle;
  const interactive = (target: EventTarget | null) => target instanceof Element && !!target.closest('button,a,input,select,textarea,label,[role="checkbox"],[role="button"]');
  return <div className={cx("ui-table-scroll", variant !== 'default' && `ui-table-scroll--${variant}`, className)}>
    <table className="ui-table">
      <caption className={variant === 'embedded' || variant === 'settings' ? 'ui-sr-only' : undefined}>{caption}</caption>
      <thead><tr>{columns.map(column => <th key={column.key} scope="col">{column.header}</th>)}{expansion ? <th scope="col" className="ui-table-expansion-heading"><span className="ui-sr-only">Налаштування</span></th> : null}</tr></thead>
      <tbody>{rows.map(row => {
        const expanded = !!expansion?.ids.includes(row.id), regionId = `${scope}-${encodeURIComponent(row.id)}`;
        return <Fragment key={row.id}>
          <tr tabIndex={activate ? 0 : undefined} aria-label={rowLabel?.(row)} aria-expanded={expansion ? expanded : undefined} aria-controls={expansion ? regionId : undefined} data-selected={selectedIds?.includes(row.id) || undefined} data-expanded={expanded || undefined} data-interactive={!!activate || undefined}
            onClick={activate ? event => { if (!interactive(event.target)) { event.currentTarget.focus({ preventScroll: true }); activate(row); } } : undefined}
            onKeyDown={activate ? event => { if (event.target === event.currentTarget && ['Enter',' '].includes(event.key)) { event.preventDefault(); activate(row); } } : undefined}>
            {columns.map(column => <td key={column.key}>{column.render ? column.render(row) : String((row as Record<string, unknown>)[column.key] ?? "—")}</td>)}
            {expansion ? <td className="ui-table-expansion-control"><IconButton variant="ghost" size="sm" label={expansion.label(row)} aria-expanded={expanded} aria-controls={regionId} onClick={() => expansion.onToggle(row)} icon={<ChevronDown size={17} className={cx('ui-table-expansion-icon', expanded && 'ui-table-expansion-icon--open')}/>}/></td> : null}
          </tr>
          {expanded && expansion ? <tr className="ui-table-detail-row"><td colSpan={columns.length + 1}><div id={regionId} role="region" aria-label={expansion.label(row)} className="ui-table-detail">{expansion.render(row)}</div></td></tr> : null}
        </Fragment>;
      })}{rows.length === 0 ? <tr><td colSpan={columns.length + (expansion ? 1 : 0)} className="ui-table-empty">Немає записів</td></tr> : null}</tbody>
    </table>
  </div>;
}

export function Pagination({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (page: number) => void }) {
  const pages = Array.from({ length: Math.max(1, totalPages) }, (_, index) => index + 1);
  const visible = pages.filter((value) => value === 1 || value === totalPages || Math.abs(value - page) <= 1);
  return <nav className="ui-pagination" aria-label="Сторінки таблиці"><IconButton label="Попередня сторінка" icon={<ChevronLeft size={16} />} variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} />{visible.map((value, index) => <span className="ui-pagination-piece" key={value}>{index > 0 && value - visible[index - 1] > 1 ? <span aria-hidden="true">…</span> : null}<Button size="sm" variant={value === page ? "primary" : "ghost"} aria-label={`Сторінка ${value}`} aria-current={value === page ? "page" : undefined} onClick={() => onPageChange(value)}>{value}</Button></span>)}<IconButton label="Наступна сторінка" icon={<ChevronRight size={16} />} variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} /></nav>;
}

export function Spinner({ label = "Завантаження", size = 20 }: { label?: string; size?: number }) {
  return <span className="ui-spinner" role="status"><LoaderCircle size={size} className="ui-spin" aria-hidden="true" /><span>{label}</span></span>;
}

export function EmptyState({ title, description, action, icon = <Layers size={25} /> }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  return <div className="ui-empty-state"><span className="ui-state-icon" aria-hidden="true">{icon}</span><h3>{title}</h3>{description ? <p>{description}</p> : null}{action}</div>;
}

export function ErrorState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="ui-error-state" role="alert"><span className="ui-state-icon" aria-hidden="true"><AlertCircle size={24} /></span><div><h3>{title}</h3>{description ? <p>{description}</p> : null}{action}</div></div>;
}

export function Accordion({ items, defaultValue = [], multiple = false }: { items: readonly { value: string; title: ReactNode; content: ReactNode; disabled?: boolean }[]; defaultValue?: string[]; multiple?: boolean }) {
  return <BaseAccordion.Root className="ui-accordion" defaultValue={defaultValue} multiple={multiple}>{items.map((item) => <BaseAccordion.Item className="ui-accordion-item" value={item.value} key={item.value} disabled={item.disabled}><BaseAccordion.Header><BaseAccordion.Trigger className="ui-accordion-trigger">{item.title}<ChevronDown size={16} aria-hidden="true" /></BaseAccordion.Trigger></BaseAccordion.Header><BaseAccordion.Panel className="ui-accordion-panel">{item.content}</BaseAccordion.Panel></BaseAccordion.Item>)}</BaseAccordion.Root>;
}
