"use client";

import { useId, useRef, useState, type DragEvent } from "react";
import { AlertCircle, File as FileIcon, FolderOpen, Upload, X } from "lucide-react";
import { Button } from "./components";

export type FileInputProps = {
  label: string;
  value?: File | null;
  defaultValue?: File | null;
  onFileChange?: (file: File | null) => void;
  accept?: string;
  maxSizeBytes?: number;
  disabled?: boolean;
  error?: string;
  hint?: string;
  statusText?: string;
  className?: string;
};

function formatSize(size: number) {
  const units = size >= 1024 * 1024 ? { divisor: 1024 * 1024, label: "МіБ" } : size >= 1024 ? { divisor: 1024, label: "КіБ" } : { divisor: 1, label: "Б" };
  return `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 1 }).format(size / units.divisor)} ${units.label}`;
}

function matchesAccept(file: File, accept: string | undefined) {
  const formats = accept?.split(",").map((format) => format.trim().toLowerCase()).filter(Boolean);
  if (!formats?.length) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return formats.some((format) => format.startsWith(".") ? name.endsWith(format) : format.endsWith("/*") ? type.startsWith(format.slice(0, -1)) : type === format);
}

export function FileInput({ label, value, defaultValue = null, onFileChange, accept, maxSizeBytes, disabled = false, error, hint, statusText, className }: FileInputProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const chooseRef = useRef<HTMLButtonElement>(null);
  const dragDepth = useRef(0);
  const [localFile, setLocalFile] = useState<File | null>(defaultValue);
  const [validationError, setValidationError] = useState<string>();
  const [dragging, setDragging] = useState(false);
  const currentFile = value === undefined ? localFile : value;
  const displayedError = validationError || error;
  const descriptionIds = [`${id}-status`, hint && `${id}-hint`, displayedError && `${id}-error`].filter(Boolean).join(" ");

  function resetInput() {
    if (inputRef.current) inputRef.current.value = "";
  }

  function chooseFile(files: FileList | File[]) {
    resetInput();
    if (disabled || files.length === 0) return;
    if (files.length !== 1) {
      setValidationError("Оберіть лише один файл. Попередній вибір збережено.");
      return;
    }
    const file = files[0];
    if (!matchesAccept(file, accept)) {
      setValidationError(`Цей тип файлу не підтримується. Дозволено: ${accept}. Попередній вибір збережено.`);
      return;
    }
    if (maxSizeBytes !== undefined && (!Number.isFinite(maxSizeBytes) || maxSizeBytes < 0)) {
      setValidationError("Не вдалося перевірити розмір: обмеження файлу має бути невід’ємним числом байтів.");
      return;
    }
    if (maxSizeBytes !== undefined && file.size > maxSizeBytes) {
      setValidationError(`Файл завеликий (${formatSize(file.size)}). Максимум — ${formatSize(maxSizeBytes)}. Попередній вибір збережено.`);
      return;
    }
    setValidationError(undefined);
    if (value === undefined) setLocalFile(file);
    onFileChange?.(file);
  }

  function clearFile() {
    if (disabled) return;
    resetInput();
    setValidationError(undefined);
    if (value === undefined) setLocalFile(null);
    onFileChange?.(null);
    requestAnimationFrame(() => chooseRef.current?.focus());
  }

  function dragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = disabled ? "none" : "copy";
  }

  return (
    <div className={["ui-field", "ui-file-field", className].filter(Boolean).join(" ")} data-disabled={disabled || undefined}>
      <label className="ui-label" htmlFor={`${id}-choose`} id={`${id}-label`}>{label}</label>
      <input ref={inputRef} className="ui-file-input" type="file" hidden aria-hidden="true" aria-label={label} tabIndex={-1} disabled={disabled} accept={accept} onChange={(event) => { if (event.currentTarget.files) chooseFile(Array.from(event.currentTarget.files)); }} />
      <div className="ui-file-dropzone" role="group" aria-labelledby={`${id}-label`} aria-describedby={descriptionIds} aria-disabled={disabled || undefined} data-dragging={dragging && !disabled || undefined} data-invalid={!!displayedError || undefined}
        onDragOver={dragOver}
        onDragEnter={(event) => { event.preventDefault(); if (disabled) return; dragDepth.current += 1; setDragging(true); }}
        onDragLeave={(event) => { event.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (dragDepth.current === 0) setDragging(false); }}
        onDrop={(event) => { event.preventDefault(); dragDepth.current = 0; setDragging(false); if (!disabled) chooseFile(Array.from(event.dataTransfer.files)); }}>
        <span className="ui-file-emblem" aria-hidden="true"><Upload size={20} /></span>
        <p className="ui-file-instruction">Перетягніть файл сюди або оберіть його на пристрої</p>
        <div className="ui-file-actions">
          <Button id={`${id}-choose`} ref={chooseRef} variant="secondary" size="sm" icon={<FolderOpen size={16} />} disabled={disabled} aria-label={`${currentFile ? "Замінити" : "Обрати"} файл: ${label}`} aria-describedby={descriptionIds} aria-invalid={!!displayedError || undefined} onClick={() => { resetInput(); inputRef.current?.click(); }}>{currentFile ? "Замінити файл" : "Обрати файл"}</Button>
          {currentFile && <Button variant="ghost" size="sm" icon={<X size={16} />} disabled={disabled} aria-label={`Очистити файл: ${label}`} onClick={clearFile}>Очистити</Button>}
        </div>
        <div className="ui-file-status" id={`${id}-status`} role="status" aria-live="polite" aria-atomic="true">
          {statusText !== undefined ? <p>{statusText}</p> : currentFile ? <>
            <div className="ui-file-selected"><FileIcon size={19} aria-hidden="true" /><span className="ui-file-details"><span className="ui-file-name">{currentFile.name}</span><span className="ui-file-size">{formatSize(currentFile.size)}</span></span></div>
            <p>Файл обрано локально. На сервер не завантажено.</p>
          </> : <p>Файл не обрано. Завантаження на сервер не виконується.</p>}
        </div>
      </div>
      {hint && <p className="ui-field-description" id={`${id}-hint`}>{hint}</p>}
      {displayedError && <p className="ui-field-description ui-text-danger" id={`${id}-error`} role="alert"><AlertCircle size={13} aria-hidden="true" />{displayedError}</p>}
    </div>
  );
}
