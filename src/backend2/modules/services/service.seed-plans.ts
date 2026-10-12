import { withTransaction } from '../../db/client'
import {
  type ServiceDraftInput,
  type ServiceDraftPatch,
  canonicalServiceDraft,
  mergeServiceDraft,
} from '../../contracts/service.contract'
import * as repo from './service.repo'
import { loadVersions } from './service.service'

/**
 * Gives existing packages their instalment and rent prices, once.
 *
 * The migration that adds the columns is structure only, so the two live
 * packages start without plans and the Services page shows "Auf Anfrage" under
 * the other two tabs until somebody fills them in. The owner can do that by
 * hand in the Dashboard; this does the same for the prices agreed on 12 Oct
 * 2026, in one step, to the draft *and* to the live version — so the plans are
 * live as soon as they exist, without publishing anything else the owner has
 * waiting.
 *
 * Deliberately narrow, because it writes to the live catalogue:
 *
 * - It only **fills empty plan fields**. A plan the owner already typed is
 *   never overwritten, so running it twice, or after editing by hand, changes
 *   nothing.
 * - It never touches the package's price, its texts, its address or anything
 *   else. A price that differs from the expected one is reported, not changed.
 * - A service that is not live, or whose address does not exist, is skipped
 *   and reported.
 * - Other pending edits stay pending: "Live · edited" stays "Live · edited".
 */

export type PlanSeed = {
  /** The service's current public address. */
  slug: string
  /** The price the package is expected to have; only compared, never written. */
  amountCents: number
  instalment: { monthlyCents: number; months: number }
  rent: { monthlyCents: number; minTermMonths: number }
}

export type PlanSeedResult = {
  slug: string
  outcome: 'seeded' | 'already-set' | 'not-found' | 'not-live'
  notes: string[]
}

/** The prices for the two packages that are live (owner, 12 Oct 2026). */
export const PACKAGE_PLAN_SEEDS: PlanSeed[] = [
  {
    slug: 'gefunden-werden',
    amountCents: 99_900,
    instalment: { monthlyCents: 9_900, months: 12 },
    rent: { monthlyCents: 3_499, minTermMonths: 12 },
  },
  {
    slug: 'vertrauen-gewinnen',
    amountCents: 149_900,
    instalment: { monthlyCents: 14_900, months: 12 },
    rent: { monthlyCents: 4_999, minTermMonths: 12 },
  },
]

/** The seed as a patch of only the groups this version has empty. */
const missingPlans = (version: ServiceDraftInput, seed: PlanSeed): ServiceDraftPatch => ({
  price: {
    ...(version.price.instalment.monthlyCents === null ? { instalment: seed.instalment } : {}),
    ...(version.price.rent.monthlyCents === null ? { rent: seed.rent } : {}),
  },
})

export const seedPaymentPlans = async (seeds: PlanSeed[]): Promise<PlanSeedResult[]> => {
  const results: PlanSeedResult[] = []

  for (const seed of seeds) {
    results.push(await seedOne(seed))
  }

  return results
}

const seedOne = async (seed: PlanSeed): Promise<PlanSeedResult> => {
  const serviceId = await repo.findSlugOwner(seed.slug)

  // A retired address still resolves to its service; only the current one counts.
  if (!serviceId || (await repo.currentSlug(serviceId)) !== seed.slug) {
    return { slug: seed.slug, outcome: 'not-found', notes: ['No service has this address.'] }
  }

  return withTransaction(async () => {
    const row = await repo.lockService(serviceId)

    if (!row || !row.draft_version_id || !row.published_version_id) {
      return { slug: seed.slug, outcome: 'not-live' as const, notes: ['The service is not published, so nothing was changed.'] }
    }

    const { draft, published } = await loadVersions(row)

    if (!published) {
      return { slug: seed.slug, outcome: 'not-live' as const, notes: ['The service is not published, so nothing was changed.'] }
    }

    const notes: string[] = []

    if (published.price.amountCents !== seed.amountCents) {
      notes.push(
        `The live price is ${published.price.amountCents ?? 'not set'} cents, not the expected ${seed.amountCents}. It was left as it is.`,
      )
    }

    const nextDraft = mergeServiceDraft(draft, missingPlans(draft, seed))
    const nextPublished = mergeServiceDraft(published, missingPlans(published, seed))
    const draftChanged = canonicalServiceDraft(nextDraft) !== canonicalServiceDraft(draft)
    const publishedChanged = canonicalServiceDraft(nextPublished) !== canonicalServiceDraft(published)

    if (!draftChanged && !publishedChanged) {
      return { slug: seed.slug, outcome: 'already-set' as const, notes }
    }

    // Were the two identical before? Then they are identical after, and the
    // service must not start to look "edited" because of this.
    const inSync = canonicalServiceDraft(draft) === canonicalServiceDraft(published)

    if (publishedChanged) await repo.writeVersion(row.published_version_id, nextPublished)

    if (draftChanged) {
      await repo.writeVersion(row.draft_version_id, nextDraft)

      const revision = await repo.bumpRevision(row.id)

      if (inSync) await repo.markInSync(row.id, revision)
    }

    return { slug: seed.slug, outcome: 'seeded' as const, notes }
  })
}
