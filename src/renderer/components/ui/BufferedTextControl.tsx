import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CompositionEvent,
  type FocusEvent,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes
} from 'react';

type BufferedValue = {
  value: string;
  setValue: (value: string) => void;
  flush: () => void;
  startComposition: () => void;
  endComposition: (value: string) => void;
};

const useBufferedValue = (value: string, onCommit: (value: string) => void, delay: number): BufferedValue => {
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(value);
  const committedRef = useRef(value);
  const commitRef = useRef(onCommit);
  const timerRef = useRef<number | null>(null);
  const composingRef = useRef(false);

  useEffect(() => { commitRef.current = onCommit; }, [onCommit]);
  useEffect(() => {
    if (value === committedRef.current) return;
    committedRef.current = value;
    draftRef.current = value;
    setDraft(value);
  }, [value]);
  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  const flush = useCallback((): void => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    const next = draftRef.current;
    if (next === committedRef.current) return;
    committedRef.current = next;
    commitRef.current(next);
  }, []);

  const scheduleCommit = useCallback((): void => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(flush, delay);
  }, [delay, flush]);

  const setValue = useCallback((next: string): void => {
    draftRef.current = next;
    setDraft(next);
    if (!composingRef.current) scheduleCommit();
  }, [scheduleCommit]);

  const startComposition = useCallback((): void => {
    composingRef.current = true;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);
  const endComposition = useCallback((next: string): void => {
    composingRef.current = false;
    draftRef.current = next;
    setDraft(next);
    scheduleCommit();
  }, [scheduleCommit]);

  return { value: draft, setValue, flush, startComposition, endComposition };
};

type BufferedTextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'defaultValue' | 'onChange' | 'value'> & {
  value: string;
  onCommit: (value: string) => void;
  commitDelay?: number;
};

export const BufferedTextarea = forwardRef<HTMLTextAreaElement, BufferedTextareaProps>(({
  value,
  onCommit,
  commitDelay = 180,
  onBlur,
  onCompositionStart,
  onCompositionEnd,
  ...props
}, ref) => {
  const buffered = useBufferedValue(value, onCommit, commitDelay);
  return (
    <textarea
      {...props}
      ref={ref}
      value={buffered.value}
      onChange={(event: ChangeEvent<HTMLTextAreaElement>) => buffered.setValue(event.currentTarget.value)}
      onBlur={(event: FocusEvent<HTMLTextAreaElement>) => { buffered.flush(); onBlur?.(event); }}
      onCompositionStart={(event: CompositionEvent<HTMLTextAreaElement>) => { buffered.startComposition(); onCompositionStart?.(event); }}
      onCompositionEnd={(event: CompositionEvent<HTMLTextAreaElement>) => { buffered.endComposition(event.currentTarget.value); onCompositionEnd?.(event); }}
    />
  );
});
BufferedTextarea.displayName = 'BufferedTextarea';

type BufferedInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'defaultValue' | 'onChange' | 'value'> & {
  value: string;
  onCommit: (value: string) => void;
  commitDelay?: number;
};

export const BufferedInput = forwardRef<HTMLInputElement, BufferedInputProps>(({
  value,
  onCommit,
  commitDelay = 180,
  onBlur,
  onCompositionStart,
  onCompositionEnd,
  ...props
}, ref) => {
  const buffered = useBufferedValue(value, onCommit, commitDelay);
  return (
    <input
      {...props}
      ref={ref}
      value={buffered.value}
      onChange={(event: ChangeEvent<HTMLInputElement>) => buffered.setValue(event.currentTarget.value)}
      onBlur={(event: FocusEvent<HTMLInputElement>) => { buffered.flush(); onBlur?.(event); }}
      onCompositionStart={(event: CompositionEvent<HTMLInputElement>) => { buffered.startComposition(); onCompositionStart?.(event); }}
      onCompositionEnd={(event: CompositionEvent<HTMLInputElement>) => { buffered.endComposition(event.currentTarget.value); onCompositionEnd?.(event); }}
    />
  );
});
BufferedInput.displayName = 'BufferedInput';
