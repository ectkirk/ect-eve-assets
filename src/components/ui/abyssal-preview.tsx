import * as HoverCard from '@radix-ui/react-hover-card'
import { useState } from 'react'

interface AbyssalPreviewProps {
  itemId: number
  children: React.ReactNode
}

export function AbyssalPreview({ itemId, children }: AbyssalPreviewProps) {
  const [hasError, setHasError] = useState(false)

  if (hasError) {
    return <>{children}</>
  }

  return (
    <HoverCard.Root openDelay={300} closeDelay={100}>
      <HoverCard.Trigger asChild>
        <span>{children}</span>
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          className="z-50 rounded-lg border border-border bg-surface p-2 shadow-lg"
          side="right"
          align="start"
          sideOffset={8}
        >
          <img
            src={`https://mutamarket.com/og/module/${itemId}.png`}
            alt="Abyssal module preview"
            className="rounded"
            onError={() => setHasError(true)}
          />
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  )
}
