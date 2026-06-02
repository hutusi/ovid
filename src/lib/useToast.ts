import { useCallback, useRef, useState } from "react";

export interface Toast {
  id: number;
  message: string;
  leaving?: boolean;
}

const VISIBLE_MS = 2000;
const EXIT_MS = 180;

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const showToast = useCallback((message: string) => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), EXIT_MS);
    }, VISIBLE_MS);
  }, []);

  return { toasts, showToast };
}
