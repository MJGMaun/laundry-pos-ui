// Client-side preview of the loyalty discount the server will compute in
// LoyaltyService::reconcileLoyaltyDiscount. Kept in one place because POS and
// the Order Detail "add loads" drawer both show it before saving, and the two
// screens quoting different numbers is worse than either being wrong.
//
// The server is always authoritative — this only decides what the cashier sees
// while ringing up.

/** Reward types that come off the order total (mirrors LoyaltyRule::DISCOUNT_TYPES). */
export const DISCOUNT_TYPES = ['free_load', 'fixed_discount']

export const isDiscountReward = (rule) => DISCOUNT_TYPES.includes(rule?.reward_type)

/** How a rule reads on a badge: "Free load" or "₱50 off". */
export function rewardLabel(rule) {
  if (!rule) return ''
  if (rule.reward_type === 'free_load') return 'Free load'
  if (rule.reward_type === 'fixed_discount') {
    return `₱${Number(rule.reward_amount || 0).toLocaleString('en-PH', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })} off`
  }
  return rule.reward_description || ''
}

/**
 * Price a list of rules (one entry per redeemable reward, newest first) against
 * the eligible load unit prices in the order.
 *
 * A free load takes the cheapest remaining eligible unit; a fixed discount takes
 * its flat amount. The running total is capped at the eligible-load value, and a
 * reward that doesn't fit whole is left pending rather than partly spent.
 *
 * @param {Array<object>} rules       rule objects, in redemption order
 * @param {Array<number>} unitPrices  per-unit price of each eligible load
 * @returns {{ count: number, discount: number }}
 */
export function priceRewards(rules, unitPrices) {
  const units = [...unitPrices].sort((a, b) => a - b)
  const cap = units.reduce((s, p) => s + p, 0)

  let nextUnit = 0
  let discount = 0
  let count = 0

  for (const rule of rules) {
    let value
    if (rule?.reward_type === 'free_load') {
      if (nextUnit >= units.length) continue
      value = units[nextUnit]
    } else if (rule?.reward_type === 'fixed_discount') {
      value = Number(rule.reward_amount || 0)
      if (value <= 0) continue
    } else {
      continue
    }

    if (round2(discount + value) > round2(cap)) continue

    if (rule.reward_type === 'free_load') nextUnit++
    discount += value
    count++
  }

  return { count, discount: round2(discount) }
}

/**
 * The rules behind every reward this customer could spend on this order:
 * already-pending ones first, then any the cart itself unlocks. Order matches
 * the server, which redeems newest-earned first.
 */
export function redeemableRules(loyalty, prospectiveStamps) {
  if (!loyalty) return []

  const pending = (loyalty.pending_rewards || [])
    .filter((r) => isDiscountReward(r.rule))
    .map((r) => r.rule)

  const unlocked = []
  for (const rule of loyalty.rules || []) {
    if (!isDiscountReward(rule)) continue
    const before = Math.floor(loyalty.total_stamps / rule.every_n_stamps)
    const after = Math.floor(prospectiveStamps / rule.every_n_stamps)
    for (let i = 0; i < Math.max(0, after - before); i++) unlocked.push(rule)
  }

  return [...pending, ...unlocked]
}

const round2 = (n) => Math.round(n * 100) / 100
