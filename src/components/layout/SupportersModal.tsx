import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'

interface SupportersModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface SupporterRowProps {
  name: string
  contribution: string
}

function SupporterRow({ name, contribution }: SupporterRowProps) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="font-medium text-content">{name}</span>
      <span className="text-content-muted">{contribution}</span>
    </div>
  )
}

const SUPPORTERS: SupporterRowProps[] = [
  { name: 'Riperd Jacks', contribution: 'Erebus Titan' },
]

export function SupportersModal({ open, onOpenChange }: SupportersModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Supporters</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-4 pr-4 text-sm">
            <p className="text-content-secondary">
              These capsuleers showed their support for ECT EVE Assets. Their
              generosity keeps morale high and the coffee flowing. o7
            </p>
            <div className="divide-y divide-border">
              {SUPPORTERS.map((supporter) => (
                <SupporterRow key={supporter.name} {...supporter} />
              ))}
            </div>
            <p className="text-center text-content-muted text-xs pt-2">
              Want to see your name here? Check out Support Us in settings.
            </p>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
