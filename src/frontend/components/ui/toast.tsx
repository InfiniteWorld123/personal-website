import * as React from "react"
import { Toast as ToastPrimitive } from "radix-ui"

import { cn } from "#/frontend/lib/utils"

/**
 * An owned toast, on the same primitive family as `dialog.tsx` and
 * `sheet.tsx` — so it takes the swipe-to-dismiss, the escape key, the polite
 * live region, and the focus behaviour from Radix rather than from us.
 *
 * Nothing here decides *when* to speak. That is `lib/notify.ts`, and the
 * component that reads it is `components/feedback/Toaster.tsx`.
 */

function ToastProvider({ ...props }: React.ComponentProps<typeof ToastPrimitive.Provider>) {
  return <ToastPrimitive.Provider {...props} />
}

function ToastViewport({
  className,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Viewport>) {
  return (
    <ToastPrimitive.Viewport
      data-slot="toast-viewport"
      className={cn(
        "fixed bottom-0 z-100 m-0 flex w-[min(24rem,calc(100vw-2rem))] list-none flex-col gap-2 p-4 outline-none",
        // Bottom-end: out of the way of the admin's top bar, and on the side
        // the language is read towards, so it never covers the first column.
        "end-0",
        className,
      )}
      {...props}
    />
  )
}

function Toast({
  className,
  tone = "error",
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Root> & { tone?: "error" | "success" }) {
  return (
    <ToastPrimitive.Root
      data-slot="toast"
      data-tone={tone}
      className={cn(
        "border-border bg-card text-card-foreground flex items-start gap-3 rounded-lg border p-3 shadow-lg",
        "data-open:animate-in data-open:slide-in-from-bottom-2 data-open:fade-in-0",
        "data-closed:animate-out data-closed:fade-out-0",
        "data-swipe-move:translate-x-(--radix-toast-swipe-move-x) data-swipe-cancel:translate-x-0 data-swipe-cancel:transition-transform",
        tone === "error" && "border-destructive/40",
        className,
      )}
      {...props}
    />
  )
}

function ToastTitle({ className, ...props }: React.ComponentProps<typeof ToastPrimitive.Title>) {
  return (
    <ToastPrimitive.Title
      data-slot="toast-title"
      className={cn("text-xs font-semibold tracking-wide uppercase", className)}
      {...props}
    />
  )
}

function ToastDescription({
  className,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Description>) {
  return (
    <ToastPrimitive.Description
      data-slot="toast-description"
      className={cn("text-sm leading-6", className)}
      {...props}
    />
  )
}

function ToastClose({ className, ...props }: React.ComponentProps<typeof ToastPrimitive.Close>) {
  return (
    <ToastPrimitive.Close
      data-slot="toast-close"
      className={cn(
        "text-muted-foreground hover:text-foreground grid size-6 shrink-0 place-items-center rounded-md transition-colors",
        className,
      )}
      {...props}
    />
  )
}

export { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport }
