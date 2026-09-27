import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** shadcn's class combiner — used by the components pulled from paperclip / VoiceStudio. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
