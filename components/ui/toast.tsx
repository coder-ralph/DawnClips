"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Tone = "default" | "error";
type ToastAction = { label: string; href: string };
type Toast = { id: number; message: string; tone: Tone; action?: ToastAction };

const ToastContext = createContext<(message: string, tone?: Tone, action?: ToastAction) => void>(() => undefined);

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const push = useCallback((message: string, tone: Tone = "default", action?: ToastAction) => {
    const id = ++counter.current;
    setToasts((current) => [...current.slice(-2), { id, message, tone, action }]);
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), tone === "error" ? 5000 : action ? 6000 : 2800);
  }, []);

  return (
    <ToastContext value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        {toasts.map((item) => (
          <p
            key={item.id}
            role={item.tone === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex max-w-sm items-center gap-3 rounded-full px-4 py-2.5 text-center text-sm font-medium",
              item.tone === "error" ? "bg-danger text-background" : "bg-foreground text-background",
            )}
          >
            {item.message}
            {item.action ? (
              <a href={item.action.href} className="font-bold underline underline-offset-2">{item.action.label}</a>
            ) : null}
          </p>
        ))}
      </div>
    </ToastContext>
  );
}
