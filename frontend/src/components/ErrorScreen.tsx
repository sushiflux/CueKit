import { IconHome } from '@tabler/icons-react'
import type { Icon, IconProps } from '@tabler/icons-react'
import { motion } from 'motion/react'
import type { ComponentType } from 'react'
import { useNavigate } from 'react-router'

interface ErrorScreenProps {
  code: string
  title: string
  description?: string
  icon: ComponentType<IconProps> | Icon
  showHomeButton?: boolean
}

/**
 * Theme-faehige Vollbild-Statusseite (404 usw.) nach dem Vorbild von PrimeSources ErrorScreen:
 * Icon-Kachel mit Spring, danach Text und Buttons leicht gestaffelt.
 */
export function ErrorScreen({ code, title, description, icon: IconComponent, showHomeButton = true }: ErrorScreenProps) {
  const navigate = useNavigate()

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-xl space-y-8 text-center">
        <motion.div
          className="flex justify-center"
          initial={{ opacity: 0, scale: 0.85, y: -12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        >
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-brand/25 blur-3xl" aria-hidden="true" />
            <div className="card relative p-6 backdrop-blur-xl">
              <IconComponent size={80} stroke={1.25} className="text-brand" />
            </div>
          </div>
        </motion.div>

        <motion.div
          className="space-y-3"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1, ease: 'easeOut' }}
        >
          <h1 className="bg-gradient-to-br from-brand to-brand/30 bg-clip-text text-7xl font-black tracking-tighter text-transparent">
            {code}
          </h1>
          <h2 className="text-2xl font-bold tracking-tight text-ink">{title}</h2>
          {description && <p className="mx-auto max-w-md leading-relaxed text-ink-muted">{description}</p>}
        </motion.div>

        {showHomeButton && (
          <motion.div
            className="flex justify-center"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.2, ease: 'easeOut' }}
          >
            <button className="btn btn-ghost" onClick={() => navigate('/')}>
              <IconHome size={18} />
              Zum Deck
            </button>
          </motion.div>
        )}
      </div>
    </div>
  )
}
