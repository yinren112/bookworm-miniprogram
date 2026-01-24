export type FeedbackLevel = 'light' | 'medium' | 'heavy' | 'long'

export function tap(level?: FeedbackLevel): void
export function correct(): void
export function wrong(): void
export function success(): void
export function warn(): void
