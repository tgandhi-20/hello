import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Upload } from 'lucide-react';
import { EmptyState } from '@/ui/EmptyState';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { useToast } from '@/ui/Toast';
import { useStore } from '@/store/useStore';
import type { AccountId, Txn } from '@/types';
import {
  analyzeCsv,
  buildManualLayout,
  buildImportPreview,
  analyseSignConvention,
  detectBankFormat,
  existingHashSet,
  type StructuralLayout,
  type BankFormat,
  type ManualColumnMapping,
  type RawCsv,
} from '@/import';
import { SourcePicker } from './components/SourcePicker';
import { ManualMapper } from './components/ManualMapper';
import { PreviewSheet } from './components/PreviewSheet';

type Phase = 'pick' | 'mapping' | 'preview' | 'error';

/**
 * Import screen (CONTRACTS.md §6, §9): pick/drop/paste a CSV, detect its structure and
 * bank format, resolve the sign convention, and require an explicit confirm on a
 * preview screen before anything is written to the store. `addTxns` (owned by Agent 2)
 * does the actual dedupe-on-write; this screen's own duplicate count is a preview-time
 * estimate shown before commit.
 */
export function ImportScreen() {
  const { txns, categories, rules, addTxns } = useStore();
  const toast = useToast();

  const [phase, setPhase] = useState<Phase>('pick');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [rawCsv, setRawCsv] = useState<RawCsv | null>(null);
  const [layout, setLayout] = useState<StructuralLayout | null>(null);
  const [detectedFormat, setDetectedFormat] = useState<BankFormat>('generic');
  const [detectionConfidence, setDetectionConfidence] = useState(0);

  const [account, setAccount] = useState<AccountId>('cba');
  const [signInverted, setSignInverted] = useState(false);

  const [preview, setPreview] = useState<{ rows: Txn[]; duplicateCount: number; warnings: string[] } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [committing, setCommitting] = useState(false);

  const buildRequestId = useRef(0);

  const reset = useCallback(() => {
    setPhase('pick');
    setErrorMessage(null);
    setRawCsv(null);
    setLayout(null);
    setDetectedFormat('generic');
    setDetectionConfidence(0);
    setAccount('cba');
    setSignInverted(false);
    setPreview(null);
    setPreviewLoading(false);
    setProgress(null);
    setCommitting(false);
  }, []);

  const handleText = useCallback((text: string) => {
    if (text.trim() === '') {
      setErrorMessage('That file looks empty.');
      setPhase('error');
      return;
    }

    let analysis;
    try {
      analysis = analyzeCsv(text);
    } catch {
      setErrorMessage('Could not read this file as CSV. Check it exported correctly and try again.');
      setPhase('error');
      return;
    }

    if (analysis.rawCsv.rows.length === 0) {
      setErrorMessage('This file has no rows to import.');
      setPhase('error');
      return;
    }

    setRawCsv(analysis.rawCsv);

    if (!analysis.isConfident) {
      setPhase('mapping');
      return;
    }

    setLayout(analysis.layout);
    setDetectedFormat(analysis.formatDetection.format);
    setDetectionConfidence(analysis.formatDetection.confidence);
    setAccount(analysis.formatDetection.accountGuess);
    setSignInverted(analysis.signAnalysis.signInverted);
    setPhase('preview');
  }, []);

  const handleManualSubmit = useCallback(
    (mapping: ManualColumnMapping) => {
      if (!rawCsv) return;
      const manualLayout = buildManualLayout(rawCsv, mapping);
      if (manualLayout.dataRows.length === 0) {
        setErrorMessage('No data rows found with that mapping — double check the header toggle.');
        setPhase('error');
        return;
      }
      const format = detectBankFormat(manualLayout);
      const sign = analyseSignConvention(manualLayout, format.confidence >= 0.45 ? format.format : null);

      setLayout(manualLayout);
      setDetectedFormat('generic'); // manually mapped — never claim bank-detected certainty
      setDetectionConfidence(1);
      setAccount(format.confidence >= 0.45 ? format.accountGuess : 'cba');
      setSignInverted(sign.signInverted);
      setPhase('preview');
    },
    [rawCsv]
  );

  // Rebuild the preview whenever the resolved layout, account or sign convention
  // changes — including live edits from the sign-convention toggle / account selector
  // on the preview sheet itself. Nothing is written here; this only recomputes what
  // WOULD be written, per CONTRACTS.md §6 ("nothing is written until confirmed").
  useEffect(() => {
    if (!layout || phase !== 'preview') return;
    const requestId = ++buildRequestId.current;
    setPreviewLoading(true);
    setProgress(null);

    const existingHashes = existingHashSet(txns);

    buildImportPreview(layout, {
      account,
      detectedFormat,
      signInverted,
      rules,
      categories,
      existingHashes,
      onProgress: (done, total) => {
        if (buildRequestId.current === requestId) setProgress({ done, total });
      },
    })
      .then((result) => {
        if (buildRequestId.current !== requestId) return; // superseded by a newer edit
        setPreview({ rows: result.rows, duplicateCount: result.duplicateCount, warnings: result.warnings });
        setPreviewLoading(false);
      })
      .catch(() => {
        if (buildRequestId.current !== requestId) return;
        setPreviewLoading(false);
        setErrorMessage('Something went wrong while processing this file.');
        setPhase('error');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, account, signInverted, detectedFormat, phase]);

  const handleConfirm = useCallback(async () => {
    if (!preview || preview.rows.length === 0) return;
    setCommitting(true);
    try {
      const toWrite = preview.rows.map(({ id, createdAt, updatedAt, ...rest }) => rest);
      const result = await addTxns(toWrite);
      toast.show(`${result.added} new, ${result.skipped} duplicate${result.skipped === 1 ? '' : 's'} skipped`, {
        variant: 'success',
      });
      reset();
    } catch {
      setCommitting(false);
      toast.show('Could not save this import — please try again.', { variant: 'danger' });
    }
  }, [preview, addTxns, toast, reset]);

  if (phase === 'error') {
    return (
      <div className="px-4 py-6">
        <Card className="flex flex-col items-center gap-3 text-center">
          <AlertTriangle size={28} className="text-critical" aria-hidden="true" />
          <p className="text-sm text-ink-1">{errorMessage}</p>
          <Button onClick={reset}>Try again</Button>
        </Card>
      </div>
    );
  }

  if (phase === 'mapping' && rawCsv) {
    return (
      <div className="px-4 py-6">
        <ManualMapper rawCsv={rawCsv} onSubmit={handleManualSubmit} onCancel={reset} />
      </div>
    );
  }

  return (
    <div className="px-4 py-6">
      {phase === 'pick' ? (
        <div className="flex flex-col gap-6">
          <EmptyState
            icon={Upload}
            headline="Import a bank statement"
            body="CSV exports from CBA, Bankwest or Amex. Everything stays on this device."
          />
          <SourcePicker onText={handleText} />
        </div>
      ) : null}

      <PreviewSheet
        open={phase === 'preview'}
        loading={previewLoading}
        committing={committing}
        preview={
          preview
            ? { detectedFormat, account, rows: preview.rows, duplicateCount: preview.duplicateCount, warnings: preview.warnings, signInverted }
            : null
        }
        detectedFormat={detectedFormat}
        detectionConfidence={detectionConfidence}
        account={account}
        onAccountChange={setAccount}
        signInverted={signInverted}
        onSignInvertedChange={setSignInverted}
        onConfirm={handleConfirm}
        onCancel={reset}
        onRemap={() => setPhase('mapping')}
        progress={progress}
      />
    </div>
  );
}
