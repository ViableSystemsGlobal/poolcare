"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { HelpCircle, Phone, FileText } from "lucide-react";
import { useHelpDialog } from "@/contexts/help-dialog-context";

export function HelpDialog() {
  const { helpOpen, setHelpOpen } = useHelpDialog();

  return (
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Help & Keyboard Shortcuts</DialogTitle>
          <DialogDescription>
            Shortcuts and useful links to get you started.
          </DialogDescription>
        </DialogHeader>

        {/* Keyboard Shortcuts */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">Keyboard Shortcuts</h3>
          <div className="space-y-2">
            {[
              { keys: "Ctrl/\u2318 + K", description: "Search" },
              { keys: "Ctrl/\u2318 + B", description: "Toggle sidebar" },
              { keys: "Ctrl/\u2318 + N", description: "New item (context-dependent)" },
              { keys: "Escape", description: "Close dialog/modal" },
            ].map((shortcut) => (
              <div key={shortcut.keys} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{shortcut.description}</span>
                <kbd className="rounded bg-gray-100 px-2 py-1 font-mono text-xs text-gray-700">
                  {shortcut.keys}
                </kbd>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Links */}
        <div className="space-y-3 border-t border-gray-200 pt-4">
          <h3 className="text-sm font-semibold text-gray-900">Quick Links</h3>
          <div className="space-y-2 text-sm">
            <a
              href="https://poolcare.africa"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center text-gray-600 hover:text-[#397d54] transition-colors"
            >
              <HelpCircle className="mr-2 h-4 w-4" />
              Help Center
            </a>
            <div className="flex items-center text-gray-600">
              <Phone className="mr-2 h-4 w-4 shrink-0" />
              <span>
                <a href="tel:+233506226222" className="hover:text-[#397d54] transition-colors">(+233) 50 622 6222</a>
                {" / "}
                <a href="mailto:info@poolcare.africa" className="hover:text-[#397d54] transition-colors">info@poolcare.africa</a>
              </span>
            </div>
            <a
              href="https://poolcare.africa/privacy-policy/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center text-gray-600 hover:text-[#397d54] transition-colors"
            >
              <FileText className="mr-2 h-4 w-4" />
              Privacy Policy
            </a>
            <a
              href="https://poolcare.africa/terms-and-conditions/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center text-gray-600 hover:text-[#397d54] transition-colors"
            >
              <FileText className="mr-2 h-4 w-4" />
              Terms & Conditions
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
