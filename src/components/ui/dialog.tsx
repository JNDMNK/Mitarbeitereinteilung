"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Modaler Dialog auf Basis von <dialog> (Fokusfalle und ESC vom Browser) */
export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="m-auto w-[calc(100%-1.5rem)] max-w-lg rounded-xl bg-white p-0 shadow-2xl"
    >
      {open && (
        <div className="p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 className="text-xl font-bold">{title}</h2>
            <button type="button" onClick={onClose} className="-m-2 rounded-lg p-2 text-2xl leading-none text-muted hover:bg-slate-100" aria-label="Schließen">
              ×
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
