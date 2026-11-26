import React from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export default function ToastContainer({ toasts, onDismiss }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed top-4 right-4 z-50 flex flex-col gap-2.5 max-w-sm w-full px-3 sm:px-0">
      {toasts.map((toast) => {
        const isError = toast.type === 'error';
        const isSuccess = toast.type === 'success';
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-2.5 p-3 rounded-xl backdrop-blur-xl border shadow-2xl text-xs transition-all ${
              isError
                ? 'bg-rose-950/85 border-rose-500/40 text-rose-100'
                : isSuccess
                ? 'bg-emerald-950/85 border-emerald-500/40 text-emerald-100'
                : 'bg-slate-950/85 border-amber-500/40 text-amber-100'
            }`}
          >
            {isError ? (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            ) : isSuccess ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            )}
            <p className="flex-1 leading-relaxed">{toast.message}</p>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="text-slate-400 hover:text-white cursor-pointer"
              aria-label="Dismiss notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
