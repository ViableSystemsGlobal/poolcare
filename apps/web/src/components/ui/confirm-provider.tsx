"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useTheme } from "@/contexts/theme-context";

type ConfirmOpts = {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

// Imperative confirm: `const confirm = useConfirm(); if (!(await confirm({...}))) return;`
// A near drop-in for window.confirm(), but rendered as our styled dialog.
const ConfirmCtx = createContext<(opts: ConfirmOpts) => Promise<boolean>>(async () => false);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const { getThemeColor } = useTheme();
  const accent = getThemeColor();
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOpts>({ title: "" });
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const settle = useCallback((v: boolean) => {
    setOpen(false);
    resolver.current?.(v);
    resolver.current = null;
  }, []);

  const confirm = useCallback((o: ConfirmOpts) => {
    setOpts(o);
    setOpen(true);
    return new Promise<boolean>((res) => { resolver.current = res; });
  }, []);

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <ConfirmDialog
        open={open}
        onOpenChange={(o) => { if (!o) settle(false); }}
        title={opts.title}
        description={opts.description}
        confirmLabel={opts.confirmLabel}
        cancelLabel={opts.cancelLabel}
        destructive={opts.destructive}
        accent={opts.destructive ? undefined : accent}
        onConfirm={() => settle(true)}
      />
    </ConfirmCtx.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmCtx);
