import DOMPurify from 'dompurify'

export function sanitizeMailBody(html: string): string {
  const processed = html
    .replace(/<url=[^>]*>([^<]*)<\/url>/gi, '$1')
    .replace(
      /<font[^>]*color="?#?([0-9a-fA-F]+)"?[^>]*>/gi,
      '<span style="color:#$1">'
    )
    .replace(/<font[^>]*>/gi, '<span>')
    .replace(/<\/font>/gi, '</span>')
    .replace(/\n/g, '<br>')

  return DOMPurify.sanitize(processed, {
    ALLOWED_TAGS: ['p', 'br', 'b', 'i', 'u', 'strong', 'em', 'span', 'div'],
    ALLOWED_ATTR: ['style'],
    ALLOW_DATA_ATTR: false,
  })
}

export function sanitizeDescription(html: string): string {
  const withEveLinks = html.replace(
    /<a href=showinfo:(\d+)>([^<]+)<\/a>/g,
    '<span class="text-accent" data-typeid="$1">$2</span>'
  )

  return DOMPurify.sanitize(withEveLinks, {
    ALLOWED_TAGS: ['p', 'br', 'b', 'i', 'u', 'strong', 'em', 'span', 'font'],
    ALLOWED_ATTR: ['class', 'data-typeid', 'color'],
  })
}

export function processEveLinks(
  text: string,
  onNavigate?: (typeId: number) => void
): React.ReactNode {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  const regex = /<a href=showinfo:(\d+)>([^<]+)<\/a>/g
  let match

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }

    const typeIdStr = match[1]
    const linkText = match[2]
    if (!typeIdStr || !linkText) continue

    const typeId = parseInt(typeIdStr, 10)

    parts.push(
      <button
        key={`${typeId}-${match.index}`}
        onClick={() => onNavigate?.(typeId)}
        className="text-accent hover:underline"
      >
        {linkText}
      </button>
    )

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts.length > 0 ? parts : text
}
