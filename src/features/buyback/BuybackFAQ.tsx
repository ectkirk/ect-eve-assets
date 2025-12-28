import { useState } from 'react'
import DOMPurify from 'dompurify'
import { useBuybackInfoStore } from '@/store/buyback-info-store'

function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return url
    }
  } catch {
    // Invalid URL
  }
  return '#'
}

function parseMarkdown(md: string): string {
  const lines = md.split('\n')
  const result: string[] = []
  let inList = false
  let inTable = false
  let tableRows: string[][] = []

  const processInline = (text: string): string => {
    return text
      .replace(
        /\*\*([^*]+)\*\*/g,
        '<strong class="text-content font-semibold">$1</strong>'
      )
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, linkText, url) => {
        const safeUrl = sanitizeUrl(url)
        return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="text-accent hover:underline">${linkText}</a>`
      })
  }

  const flushList = () => {
    if (inList) {
      result.push('</ul>')
      inList = false
    }
  }

  const flushTable = () => {
    if (inTable && tableRows.length > 0) {
      const headerRow = tableRows[0] ?? []
      const dataRows = tableRows
        .slice(1)
        .filter((row) => !row.every((cell) => /^[-:]+$/.test(cell)))

      result.push('<div class="overflow-x-auto my-3">')
      result.push('<table class="w-full text-sm border-collapse">')
      result.push('<thead>')
      result.push('<tr class="border-b border-border">')
      headerRow.forEach((cell) => {
        result.push(
          `<th scope="col" class="px-3 py-2 text-left font-semibold text-content">${processInline(cell)}</th>`
        )
      })
      result.push('</tr>')
      result.push('</thead>')
      result.push('<tbody>')
      dataRows.forEach((row) => {
        result.push('<tr class="border-b border-border/50">')
        row.forEach((cell) => {
          result.push(
            `<td class="px-3 py-2 text-content-secondary">${processInline(cell)}</td>`
          )
        })
        result.push('</tr>')
      })
      result.push('</tbody>')
      result.push('</table>')
      result.push('</div>')

      tableRows = []
      inTable = false
    }
  }

  for (const line of lines) {
    if (line.startsWith('|') && line.endsWith('|')) {
      flushList()
      if (!inTable) inTable = true
      const cells = line
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim())
      tableRows.push(cells)
      continue
    } else if (inTable) {
      flushTable()
    }

    if (line.startsWith('- ')) {
      if (!inList) {
        result.push(
          '<ul class="list-disc list-inside space-y-1 my-2 text-content-secondary">'
        )
        inList = true
      }
      result.push(`<li>${processInline(line.slice(2))}</li>`)
      continue
    } else {
      flushList()
    }

    if (line.trim() === '') {
      continue
    }

    result.push(
      `<p class="my-2 text-content-secondary">${processInline(line)}</p>`
    )
  }

  flushList()
  flushTable()

  return DOMPurify.sanitize(result.join('\n'), {
    ALLOWED_TAGS: [
      'p',
      'ul',
      'li',
      'strong',
      'a',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'div',
    ],
    ALLOWED_ATTR: ['class', 'href', 'target', 'rel'],
  })
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between py-4 text-left text-content hover:text-accent"
      >
        <span className="font-medium">{question}</span>
        <svg
          className={`h-5 w-5 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      {isOpen && (
        <div
          className="pb-4"
          dangerouslySetInnerHTML={{ __html: parseMarkdown(answer) }}
        />
      )}
    </div>
  )
}

export function BuybackFAQ() {
  const { info } = useBuybackInfoStore()
  const faq = info?.faq

  if (!faq || faq.length === 0) {
    return null
  }

  return (
    <div className="rounded-lg border border-border bg-surface-secondary/50 p-6">
      <h2 className="mb-4 text-xl font-semibold text-content">
        Frequently Asked Questions
      </h2>
      <div className="divide-y divide-border">
        {faq.map((item, index) => (
          <FAQItem key={index} question={item.question} answer={item.answer} />
        ))}
      </div>
    </div>
  )
}
