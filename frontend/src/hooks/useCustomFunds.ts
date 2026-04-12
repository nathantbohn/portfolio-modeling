import { useState, useCallback } from 'react'
import type { CustomFund } from '../types'

const CUSTOM_COLORS = [
  '#4A90D9', // steel blue
  '#D4543A', // coral red
  '#3B8C6E', // forest green
  '#9B59B6', // amethyst
  '#E67E22', // tangerine
]

let colorIdx = 0
function nextColor(): string {
  const c = CUSTOM_COLORS[colorIdx % CUSTOM_COLORS.length]
  colorIdx++
  return c
}

let counter = 0
function generateId(): string {
  return `CUSTOM-${Date.now().toString(36)}-${(counter++).toString(36)}`
}

export interface UseCustomFundsReturn {
  customFunds: CustomFund[]
  addCustomFund: (fund: Omit<CustomFund, 'id' | 'color'>) => CustomFund
  removeCustomFund: (id: string) => void
}

export function useCustomFunds(): UseCustomFundsReturn {
  const [customFunds, setCustomFunds] = useState<CustomFund[]>([])

  const addCustomFund = useCallback((draft: Omit<CustomFund, 'id' | 'color'>): CustomFund => {
    const fund: CustomFund = { ...draft, id: generateId(), color: nextColor() }
    setCustomFunds((prev) => [...prev, fund])
    return fund
  }, [])

  const removeCustomFund = useCallback((id: string) => {
    setCustomFunds((prev) => prev.filter((f) => f.id !== id))
  }, [])

  return { customFunds, addCustomFund, removeCustomFund }
}
