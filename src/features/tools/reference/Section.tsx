export function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-border bg-surface-secondary p-4">
      <h3 className="mb-3 font-semibold text-content">{title}</h3>
      {children}
    </section>
  )
}
