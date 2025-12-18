import { useState } from 'react'
import { SECURITY_CONFIGS, ASSET_SAFETY_RATES, formatPercent } from './config'

function FAQItem({ question, children }: { question: string; children: React.ReactNode }) {
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
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && <div className="pb-4 text-content-secondary">{children}</div>}
    </div>
  )
}

export function BuybackFAQ() {
  const configs = Object.values(SECURITY_CONFIGS)

  return (
    <div className="rounded-lg border border-border bg-surface-secondary/50 p-6">
      <h2 className="mb-4 text-xl font-semibold text-content">Frequently Asked Questions</h2>
      <div className="divide-y divide-border">
        <FAQItem question="How is your buyback calculated?">
          <p className="mb-2">
            We calculate our buyback based on security status. We offer the following rates of Jita
            buy price:
          </p>
          <ul className="mb-2 list-inside list-disc space-y-1">
            {configs
              .filter(({ key }) => key !== 'assetsafety')
              .map(({ key, name, buyRate, textColor }) => (
                <li key={key}>
                  <span className={`font-medium ${textColor}`}>{name}</span>:{' '}
                  {Math.round(buyRate * 100)}%
                </li>
              ))}
            <li>
              <span className="font-medium text-status-time">Asset Safety</span>:{' '}
              {formatPercent(ASSET_SAFETY_RATES.nullsec.noNpc)} -{' '}
              {formatPercent(ASSET_SAFETY_RATES.highsec.npc)} (varies by security and NPC station)
            </li>
          </ul>
          <p>
            A variable ISK/m³ logistics penalty is then applied to the items based on total volume
            and security status.
          </p>
        </FAQItem>

        <FAQItem question="How to handle highsec islands">
          <p className="mb-2">
            Some systems appear as highsec in-game but have no highsec-only route to Jita. These are
            called "highsec islands". When quoting items from these systems, select{' '}
            <span className="font-medium text-status-highlight">Low Security</span> as your security
            status.
          </p>
          <p className="mb-2">
            We must travel through lowsec or nullsec to collect items from these locations, so they
            cannot receive highsec rates.{' '}
            <span className="font-medium text-status-negative">
              Contracts from highsec islands submitted at highsec rates will be rejected.
            </span>
          </p>
          <p className="mb-2">The following 110 systems are highsec islands:</p>
          <div className="mb-2 max-h-64 overflow-y-auto rounded bg-surface-tertiary p-3 text-sm">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="font-medium text-status-highlight">Aridia</p>
                <p className="text-content-secondary">
                  Avada, Bazadod, Chibi, Haimeh, Keba, Mishi, Pahineh, Sazilid, Shenda, Zaveral
                </p>
              </div>
              <div>
                <p className="font-medium text-status-highlight">Derelik</p>
                <p className="text-content-secondary">
                  Chidah, Fera, Jangar, Moh, Serad, Shenela, Sooma, Uhtafal
                </p>
              </div>
              <div>
                <p className="font-medium text-status-highlight">Devoid</p>
                <p className="text-content-secondary">
                  Arveyil, Faktun, Halenan, Mili, Nidebora, Palpis, Uktiad, Ulerah
                </p>
              </div>
              <div>
                <p className="font-medium text-status-highlight">Domain</p>
                <p className="text-content-secondary">Clarelam, Erzoh, Hayumtom</p>
              </div>
              <div>
                <p className="font-medium text-status-highlight">Essence</p>
                <p className="text-content-secondary">
                  Actee, Allebin, Amane, Clorteler, Droselory, Perckhevin
                </p>
              </div>
              <div>
                <p className="font-medium text-status-highlight">Everyshore</p>
                <p className="text-content-secondary">Olide</p>
              </div>
              <div>
                <p className="font-medium text-status-highlight">Heimatar</p>
                <p className="text-content-secondary">Atgur, Endrulf, Otraren</p>
              </div>
              <div>
                <p className="font-medium text-status-highlight">Kor-Azor</p>
                <p className="text-content-secondary">Piri</p>
              </div>
              <div>
                <p className="font-medium text-status-highlight">Lonetrek</p>
                <p className="text-content-secondary">
                  Aikantoh, Aivoli, Antiainen, Atai, Elanoda, Endatoh, Jotenen, Kiskoken, Liukikka,
                  Oishami, Ossa, Otalieto, Rauntaka, Semiki, Uesuro
                </p>
              </div>
              <div>
                <p className="font-medium text-status-highlight">Metropolis</p>
                <p className="text-content-secondary">Anher, Erindur, Hodrold, Hroduko</p>
              </div>
              <div>
                <p className="font-medium text-status-highlight">Molden Heath</p>
                <p className="text-content-secondary">
                  Eldulf, Fegomenko, Horaka, Kattegaud, Orien, Varigne
                </p>
              </div>
              <div>
                <p className="font-medium text-status-highlight">Placid</p>
                <p className="text-content-secondary">
                  Algasienan, Archavoinet, Brellystier, Iffrue, Ivorider, Mollin, Ommaerrer,
                  Osmallanais, Vilinnon, Vivanier
                </p>
              </div>
              <div>
                <p className="font-medium text-status-highlight">Sinq Laison</p>
                <p className="text-content-secondary">Artisine, Bamiette, Odette, Stegette</p>
              </div>
              <div>
                <p className="font-medium text-status-highlight">Solitude</p>
                <p className="text-content-secondary">
                  Arasare, Boystin, Eggheron, Gererique, Larryn, Lazer, Lour, Maire, Niballe,
                  Octanneve, Odinesyn, Oerse, Ondree, Pochelympe, Postouvin, Stoure, Vecodie,
                  Weraroix, Yvaeroure, Yvelet
                </p>
              </div>
              <div>
                <p className="font-medium text-status-highlight">The Bleak Lands</p>
                <p className="text-content-secondary">
                  Erkinen, Furskeshin, Imata, Komaa, Kurmaru, Myyhera, Netsalakka, Sasiekko,
                  Satalama
                </p>
              </div>
              <div>
                <p className="font-medium text-status-highlight">The Citadel</p>
                <p className="text-content-secondary">Eitu</p>
              </div>
              <div>
                <p className="font-medium text-status-highlight">The Forge</p>
                <p className="text-content-secondary">Otomainen</p>
              </div>
            </div>
          </div>
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
          <p className="mb-2">
            Blueprints are only valued if the input explicitly contains "BLUEPRINT ORIGINAL". This
            marker only appears when copying directly from the <strong>Assets window</strong> (list
            view, not the station container view) or from a <strong>contract</strong>. In all other
            cases, blueprints are treated as copies and given zero value.
          </p>
          <p>
            We do not track researched blueprint prices, so originals are valued at unresearched NPC
            price. Copies should not be included in buyback contracts.
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
          <p className="mb-2">
            Yes! Use our <span className="text-status-warning">Asset Safety</span> tab. Select your
            security level and whether there is an NPC station in system.
          </p>
          <p className="mb-3">Asset safety buyback rates:</p>
          <div className="mb-3 overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-tertiary">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-content-secondary">
                    Security
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-content-secondary">
                    No NPC Station
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-content-secondary">
                    NPC Station
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="px-3 py-2 font-medium text-status-positive">High-sec</td>
                  <td className="px-3 py-2 text-right text-content-secondary">
                    {formatPercent(ASSET_SAFETY_RATES.highsec.noNpc)}
                  </td>
                  <td className="px-3 py-2 text-right text-content-secondary">
                    {formatPercent(ASSET_SAFETY_RATES.highsec.npc)}
                  </td>
                </tr>
                <tr>
                  <td className="px-3 py-2 font-medium text-status-highlight">Low-sec</td>
                  <td className="px-3 py-2 text-right text-content-secondary">
                    {formatPercent(ASSET_SAFETY_RATES.lowsec.noNpc)}
                  </td>
                  <td className="px-3 py-2 text-right text-content-secondary">
                    {formatPercent(ASSET_SAFETY_RATES.lowsec.npc)}
                  </td>
                </tr>
                <tr>
                  <td className="px-3 py-2 font-medium text-status-negative">Null-sec</td>
                  <td className="px-3 py-2 text-right text-content-secondary">
                    {formatPercent(ASSET_SAFETY_RATES.nullsec.noNpc)}
                  </td>
                  <td className="px-3 py-2 text-right text-content-secondary">
                    {formatPercent(ASSET_SAFETY_RATES.nullsec.npc)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mb-2">
            The asset safety fee depends on NPC station availability:{' '}
            <span className="font-medium text-status-positive">
              {formatPercent(ASSET_SAFETY_RATES.NPC_STATION_FEE_RATE)}
            </span>{' '}
            if there is an NPC station in system, or{' '}
            <span className="font-medium text-status-warning">
              {formatPercent(ASSET_SAFETY_RATES.FEE_RATE)}
            </span>{' '}
            if not. Fees are calculated based on EVE ESI market prices and deducted from your quote
            automatically.
          </p>
          <p className="text-content-muted">
            Note: Capital ships are not accepted in high-sec asset safety.
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
              className="text-link hover:underline"
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
              className="text-link hover:underline"
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
