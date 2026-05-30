import { forwardRef } from 'react'
import { cn } from '../../lib/utils'

const Switch = forwardRef(({ className, ...props }, ref) => {
  return (
    <label className={cn('relative inline-flex items-center cursor-pointer', className)}>
      <input
        type="checkbox"
        className="sr-only peer"
        ref={ref}
        {...props}
      />
      <div className="w-11 h-6 bg-surface-700 rounded-full peer peer-checked:bg-accent-500 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-disabled:opacity-50 peer-disabled:cursor-not-allowed" />
    </label>
  )
})
Switch.displayName = 'Switch'

export { Switch }
