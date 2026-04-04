"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface HelpDialogContextValue {
  helpOpen: boolean;
  setHelpOpen: (open: boolean) => void;
}

const HelpDialogContext = createContext<HelpDialogContextValue>({
  helpOpen: false,
  setHelpOpen: () => {},
});

export function HelpDialogProvider({ children }: { children: ReactNode }) {
  const [helpOpen, setHelpOpen] = useState(false);
  return (
    <HelpDialogContext.Provider value={{ helpOpen, setHelpOpen }}>
      {children}
    </HelpDialogContext.Provider>
  );
}

export function useHelpDialog() {
  return useContext(HelpDialogContext);
}
