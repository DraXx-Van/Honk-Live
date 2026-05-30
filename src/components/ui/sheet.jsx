import { forwardRef, useEffect, useCallback } from 'react'
import { cn } from '../../lib/utils'
import { X } from 'lucide-react'

const Sheet = forwardRef(({ open, onOpenChange, children, className, side = 'bottom', ...props }, ref) => {
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onOpenChange?.(false)
  }, [onOpenChange])

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [open, handleKeyDown])

  if (!open) return null

  const sideClasses = {
    bottom: 'inset-x-0 bottom-0 rounded-t-2xl max-h-[85vh] overflow-y-auto',
    right: 'inset-y-0 right-0 w-full max-w-sm',
    left: 'inset-y-0 left-0 w-full max-w-sm',
    top: 'inset-x-0 top-0 rounded-b-2xl',
  }

  return (
    <div className="fixed inset-0 z-50 flex" {...props}>
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={() => onOpenChange?.(false)}
      />
      <div
        ref={ref}
        className={cn(
          'fixed z-50 bg-surface-900 border border-surface-700 shadow-xl p-6',
          sideClasses[side] || sideClasses.bottom,
          className
        )}
      >
        {children}
      </div>
    </div>
  )
})
Sheet.displayName = 'Sheet'

const SheetHeader = ({ className, ...props }) => (
  <div className={cn('flex items-center justify-between mb-6', className)} {...props} />
)

const SheetTitle = ({ className, ...props }) => (
  <h3 className={cn('text-lg font-semibold text-surface-100', className)} {...props} />
)

const SheetClose = ({ className, ...props }) => (
  <button
    className={cn('text-surface-400 hover:text-surface-100 transition-colors', className)}
    {...props}
  >
    <X className="h-5 w-5" />
  </button>
)

export { Sheet, SheetHeader, SheetTitle, SheetClose }
