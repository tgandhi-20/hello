import React, { useCallback, useRef, useState } from 'react';
import { Upload, FileText, ClipboardPaste } from 'lucide-react';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Textarea } from './Textarea';

export interface SourcePickerProps {
  onText: (text: string, fileName?: string) => void;
  disabled?: boolean;
}

/**
 * Entry point for getting CSV text into the importer: drop/pick a `.csv` file, or paste
 * it as text — exporting a file on a phone is awkward, so paste is a first-class path,
 * not an afterthought (CONTRACTS.md §6).
 */
export function SourcePicker({ onText, disabled }: SourcePickerProps) {
  const [dragOver, setDragOver] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      const text = await file.text();
      onText(text, file.name);
    },
    [onText]
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void handleFile(file);
    },
    [handleFile]
  );

  return (
    <div className="flex flex-col gap-4">
      <Card
        interactive
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={[
          'flex min-h-[160px] cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed text-center',
          dragOver ? 'border-accent bg-[var(--accent-tint-12)]' : '',
        ].join(' ')}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2">
          <Upload size={24} className="text-accent" aria-hidden="true" />
        </div>
        <div>
          <p className="text-md font-medium text-text-1">Drop a CSV file here</p>
          <p className="mt-1 text-sm text-text-2">or tap to choose one from your phone</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = '';
          }}
        />
      </Card>

      {!pasteOpen ? (
        <Button variant="ghost" fullWidth disabled={disabled} onClick={() => setPasteOpen(true)}>
          <ClipboardPaste size={18} aria-hidden="true" />
          Paste as text instead
        </Button>
      ) : (
        <div className="flex flex-col gap-3">
          <Textarea
            label="Paste statement text"
            rows={8}
            placeholder="Date,Amount,Description,Balance…"
            value={pasteText}
            disabled={disabled}
            onChange={(e) => setPasteText(e.target.value)}
          />
          <div className="flex gap-3">
            <Button variant="ghost" fullWidth disabled={disabled} onClick={() => setPasteOpen(false)}>
              Cancel
            </Button>
            <Button
              fullWidth
              disabled={disabled || pasteText.trim() === ''}
              onClick={() => onText(pasteText, undefined)}
            >
              <FileText size={18} aria-hidden="true" />
              Use this text
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
