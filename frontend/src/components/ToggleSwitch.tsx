import { motion } from 'framer-motion'

interface ToggleSwitchProps {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}

export default function ToggleSwitch({ checked, onChange, label }: ToggleSwitchProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 cursor-pointer group min-h-[44px] sm:min-h-0"
      type="button"
    >
      <div
        className="relative w-8 h-[18px] rounded-full transition-colors duration-200"
        style={{ backgroundColor: checked ? '#990F3D' : '#D4C4B0' }}
      >
        <motion.div
          className="absolute top-[3px] w-3 h-3 rounded-full bg-white shadow-sm"
          animate={{ x: checked ? 14 : 3 }}
          transition={{ type: 'spring', stiffness: 550, damping: 38 }}
        />
      </div>
      <span className="text-[11px] text-warm-200 group-hover:text-warm-50 transition-colors duration-150 select-none">
        {label}
      </span>
    </button>
  )
}
