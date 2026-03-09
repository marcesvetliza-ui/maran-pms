import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getLocalToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
}

export function toArgentinaDateStr(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
}
