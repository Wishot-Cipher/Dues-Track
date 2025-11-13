import { createContext } from 'react'

export type ToastApi = {
  success: (msg: React.ReactNode, duration?: number) => void
  error: (msg: React.ReactNode, duration?: number) => void
  warning: (msg: React.ReactNode, duration?: number) => void
  info: (msg: React.ReactNode, duration?: number) => void
}

export const ToastContext = createContext<ToastApi | null>(null)
