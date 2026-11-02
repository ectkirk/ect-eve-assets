// Prints GitHub release notes built from src/data/changelog.json (the in-app changelog).
// Usage: node scripts/release-notes.mjs [tag] > release-notes.md
import { readFileSync } from 'node:fs'

const REPO_URL = 'https://github.com/ectkirk/ect-eve-assets'
const SECTIONS = [
  ['feat', 'Features'],
  ['fix', 'Fixes'],
  ['perf', 'Performance'],
  ['refactor', 'Improvements'],
]

export function buildReleaseNotes(changelog, tag = `v${changelog.version}`) {
  const known = new Set(SECTIONS.map(([type]) => type))
  const groups = [...SECTIONS, ['other', 'Other changes']].map(
    ([type, title]) => [
      title,
      changelog.changes.filter((c) =>
        type === 'other' ? !known.has(c.type) : c.type === type,
      ),
    ],
  )

  const lines = [`## What's new in ${changelog.version}`, '']
  for (const [title, changes] of groups) {
    if (changes.length === 0) continue
    lines.push(`### ${title}`)
    for (const change of changes) {
      const scope = change.scope ? `**${change.scope}:** ` : ''
      lines.push(`- ${scope}${change.description}`)
    }
    lines.push('')
  }
  lines.push(`**Full history:** ${REPO_URL}/commits/${tag}`)
  return `${lines.join('\n')}\n`
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const changelog = JSON.parse(
    readFileSync(
      new URL('../src/data/changelog.json', import.meta.url),
      'utf8',
    ),
  )
  process.stdout.write(buildReleaseNotes(changelog, process.argv[2]))
}
