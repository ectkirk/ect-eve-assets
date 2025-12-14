import { useState } from 'react'
import { SECURITY_CONFIGS } from './config'

function FAQItem({ question, children }: { question: string; children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between py-4 text-left text-content hover:text-white"
      >
        <span className="font-medium">{question}</span>
        <svg
          className={`h-5 w-5 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && <div className="pb-4 text-content-secondary">{children}</div>}
    </div>
  )
}

export function BuybackFAQ() {
  const bgToText: Record<string, string> = {
    'bg-green-600': 'text-green-400',
    'bg-yellow-600': 'text-yellow-400',
    'bg-red-600': 'text-red-400',
    'bg-orange-600': 'text-orange-400',
  }

  const configs = Object.values(SECURITY_CONFIGS).map((config) => ({
    ...config,
    textColor: bgToText[config.color] || 'text-content-secondary',
  }))

  return (
    <div className="rounded-lg border border-border bg-surface-secondary/50 p-6">
      <h2 className="mb-4 text-xl font-semibold text-white">Frequently Asked Questions</h2>
      <div className="divide-y divide-slate-700">
        <FAQItem question="How is your buyback calculated?">
          <p className="mb-2">
            We calculate our buyback based on security status. We offer the following rates of Jita
            buy price:
          </p>
          <ul className="mb-2 list-inside list-disc space-y-1">
            {configs.map(({ key, name, buyRate, textColor }) => (
              <li key={key}>
                <span className={`font-medium ${textColor}`}>{name}</span>:{' '}
                {Math.round(buyRate * 100)}%
              </li>
            ))}
          </ul>
          <p>
            A variable ISK/m³ logistics penalty is then applied to the items based on total volume
            and security status.
          </p>
        </FAQItem>

        <FAQItem question="Are there items that you do not accept?">
          <p className="mb-2">Yes, we do not accept the following:</p>
          <ul className="list-inside list-disc space-y-1">
            <li>Apparel</li>
            <li>SKINs</li>
            <li>Abyssal modules</li>
            <li>Low value/high m³ items</li>
            <li>Low sales volume items</li>
            <li>Rigs</li>
            <li>Blueprint copies</li>
            <li>Crystal ammunition</li>
          </ul>
          <p className="mt-3 text-content-secondary">
            Any excluded items will be listed in a dropdown below your quote. Please remove these
            items from your contract before submitting.
          </p>
        </FAQItem>

        <FAQItem question="How do you price blueprints?">
          <p>
            We do not track the prices of researched blueprints so all blueprint originals are
            valued at unresearched NPC price. Copies are given zero value so should not be included
            in buyback contracts.
          </p>
        </FAQItem>

        <FAQItem question="How do you price capital ships?">
          <p>
            We have tracked every public capital contract for more than a year and verified whether
            they were completed or expired/deleted. We use our data for completed capital contracts
            as a baseline price, then apply the security status discount (
            {configs
              .filter(({ acceptCapitals }) => acceptCapitals)
              .map(({ key, buyRate }, i, arr) => (
                <span key={key}>
                  {Math.round(buyRate * 100)}%{i < arr.length - 1 ? '/' : ''}
                </span>
              ))}
            ). Capital ships are not subject to the volume penalty.
          </p>
        </FAQItem>

        <FAQItem question="Do you accept items in player-owned stations?">
          <p>
            Yes! Use our <span className="text-orange-400">Asset Safety</span> tab which
            automatically calculates the 15% asset safety retrieval cost based on EVE ESI market
            prices. The fee will be deducted from your quote automatically, so you can contract for
            the exact amount shown.
          </p>
        </FAQItem>

        <FAQItem question="How long does it take you to accept contracts?">
          <p>
            EC Trade is a Discord server run by a group of traders. Many of these traders are
            members of the ECTrade corporation and are able to accept your contracts. Pending
            contracts are posted to our Discord to prompt traders to review them as soon as
            possible. The average contract acceptance is within 30 minutes, but generally you
            won't be waiting more than a couple of hours at any time.
          </p>
        </FAQItem>

        <FAQItem question="What if a price looks wrong? Can I talk to you about it?">
          <p>
            Yes! Please reach out to Kirk on the EC Trade Discord:{' '}
            <a
              href="https://discord.gg/dexSsJYYbv"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline"
            >
              discord.gg/dexSsJYYbv
            </a>
          </p>
        </FAQItem>

        <FAQItem question="Where do you get your prices?">
          <p className="mb-2">
            Directly from EVE Online's official API, ESI. We do not rely on any external pricing
            services.
          </p>
          <p className="mb-2">
            We maintain our own database with live market data for all items, regions, and systems,
            updated every 30 minutes. Contract data is updated hourly, with capital ship prices
            tracked separately using our own historical sales analysis.
          </p>
          <p>
            All EC Trade tools, including this buyback service, are custom-built from the ground up
            with no external dependencies aside from EVE's official API.
          </p>
        </FAQItem>

        <FAQItem question="What makes you different from other buyback services?">
          <p className="mb-2">
            EC Trade is built around a community on our{' '}
            <a
              href="https://discord.gg/dexSsJYYbv"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline"
            >
              Discord
            </a>
            , and we have a responsibility to that community to provide the best tools and fairest
            service possible.
          </p>
          <p>
            That means transparency. We clearly list every item excluded from your quote with
            detailed reasoning, giving you the opportunity to remove them from your contract and
            sell them elsewhere. Other buyback services may silently price these items at zero or
            significantly reduced rates without telling you, meaning you lose value on items that
            could have been sold properly.
          </p>
        </FAQItem>
      </div>
      <p className="mt-4 text-sm text-content-muted">
        Note: Please check that you are only including items in the contract that were in the
        appraisal. We are not responsible for tracking down items you feel you have sent by mistake.
      </p>
    </div>
  )
}
