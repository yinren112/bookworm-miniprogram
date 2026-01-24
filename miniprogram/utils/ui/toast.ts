export type ToastKind = 'info' | 'success' | 'error'

export type ToastOptions = {
  duration?: number
}

export function info(title: string, options?: ToastOptions): void
export function success(title: string, options?: ToastOptions): void
export function error(errorLike: unknown, options?: { fallback?: string; duration?: number }): void
