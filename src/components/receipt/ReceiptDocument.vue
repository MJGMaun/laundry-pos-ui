<script setup>
import { computed } from 'vue'

const props = defineProps({
  order:    { type: Object, required: true },
  settings: { type: Object, default: () => ({}) },
})

function fmt(n) {
  return Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d) {
  return new Date(d).toLocaleString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

const shopName    = computed(() => props.settings.shop_name    || 'Laundry Shop')
const shopAddress = computed(() => props.settings.shop_address || '')
const shopPhone   = computed(() => props.settings.shop_phone   || '')
const shopTin     = computed(() => props.settings.shop_tin     || '')
const footer      = computed(() => props.settings.receipt_footer || 'Thank you for your business!')
const showLoyalty = computed(() => props.settings.receipt_show_loyalty === 'true' || props.settings.receipt_show_loyalty === true)

const nonRefundPayments = computed(() =>
  (props.order.payments || []).filter((p) => p.type !== 'refund')
)

// Cash change = sum of all cash tendered amounts minus sum of all cash payment amounts
const cashChange = computed(() => {
  const cashRows = nonRefundPayments.value.filter((p) => p.method === 'cash')
  const totalTendered = cashRows.reduce((s, p) => s + Number(p.tendered || p.amount), 0)
  const totalCashPaid = cashRows.reduce((s, p) => s + Number(p.amount), 0)
  return Math.max(0, totalTendered - totalCashPaid)
})

const balanceDue = computed(() =>
  Math.max(0, Number(props.order.total_amount || 0) - Number(props.order.paid_amount || 0))
)
</script>

<template>
  <div class="rcp">

    <!-- ── Header ── -->
    <div class="rcp-center rcp-mb">
      <div class="rcp-shop-name">{{ shopName }}</div>
      <div v-if="shopAddress" class="rcp-small">{{ shopAddress }}</div>
      <div v-if="shopPhone"   class="rcp-small">{{ shopPhone }}</div>
      <div v-if="shopTin"     class="rcp-small">TIN: {{ shopTin }}</div>
    </div>

    <div class="rcp-divider" />

    <!-- ── Order info ── -->
    <div class="rcp-info rcp-mb">
      <div class="rcp-info-row">
        <span class="rcp-lbl">Order #</span>
        <span class="rcp-val rcp-mono">{{ order.order_number }}</span>
      </div>
      <div class="rcp-info-row">
        <span class="rcp-lbl">Date</span>
        <span class="rcp-val">{{ fmtDate(order.created_at) }}</span>
      </div>
      <template v-if="order.customer">
        <div class="rcp-info-row">
          <span class="rcp-lbl">Customer</span>
          <span class="rcp-val">{{ order.customer.name }}</span>
        </div>
        <div v-if="order.customer.phone" class="rcp-info-row">
          <span class="rcp-lbl">Phone</span>
          <span class="rcp-val">{{ order.customer.phone }}</span>
        </div>
      </template>
      <div v-if="order.user" class="rcp-info-row">
        <span class="rcp-lbl">Staff</span>
        <span class="rcp-val">{{ order.user.name }}</span>
      </div>
    </div>

    <div class="rcp-divider" />

    <!-- ── Items ── -->
    <div class="rcp-items rcp-mb">
      <div class="rcp-items-header">
        <span>ITEM</span>
        <span class="rcp-mono">AMOUNT</span>
      </div>
      <div class="rcp-thin-line" />
      <div v-for="load in order.loads" :key="load.id" class="rcp-item">
        <div class="rcp-item-name">{{ load.service_name_snapshot }}</div>
        <div class="rcp-item-detail">
          <span class="rcp-item-unit">{{ load.quantity }} × ₱{{ fmt(load.unit_price_snapshot) }}</span>
          <span class="rcp-item-total rcp-mono">₱{{ fmt(load.line_total) }}</span>
        </div>
      </div>
    </div>

    <div class="rcp-divider" />

    <!-- ── Totals ── -->
    <div class="rcp-totals rcp-mb">
      <div class="rcp-total-row">
        <span>Subtotal</span>
        <span class="rcp-mono">₱{{ fmt(order.subtotal) }}</span>
      </div>
      <div v-if="Number(order.extra_fees)" class="rcp-total-row">
        <span>Extra Fees</span>
        <span class="rcp-mono">₱{{ fmt(order.extra_fees) }}</span>
      </div>
      <div v-if="Number(order.discount_amount)" class="rcp-total-row">
        <span>Discount</span>
        <span class="rcp-mono">-₱{{ fmt(order.discount_amount) }}</span>
      </div>
    </div>

    <div class="rcp-bold-divider" />

    <div class="rcp-grand-total">
      <span>TOTAL</span>
      <span class="rcp-mono">₱{{ fmt(order.total_amount) }}</span>
    </div>

    <div class="rcp-bold-divider" />

    <!-- ── Payments ── -->
    <div v-if="nonRefundPayments.length" class="rcp-payments rcp-mb">
      <div v-for="p in nonRefundPayments" :key="p.id" class="rcp-total-row">
        <span>{{ p.method?.toUpperCase() }}
          <span v-if="p.reference_number" class="rcp-ref"> · Ref: {{ p.reference_number }}</span>
        </span>
        <span class="rcp-mono">₱{{ fmt(p.amount) }}</span>
      </div>
      <div v-if="cashChange > 0" class="rcp-total-row rcp-change">
        <span>Change</span>
        <span class="rcp-mono">₱{{ fmt(cashChange) }}</span>
      </div>
    </div>

    <!-- ── Balance due (pay later) ── -->
    <template v-if="balanceDue > 0.009">
      <div class="rcp-divider" />
      <div class="rcp-balance-due rcp-mb">
        <div class="rcp-balance-label">*** BALANCE DUE ***</div>
        <div class="rcp-balance-amount rcp-mono">₱{{ fmt(balanceDue) }}</div>
        <div class="rcp-balance-note">Please pay upon pickup.</div>
      </div>
    </template>

    <!-- ── Loyalty note ── -->
    <template v-if="showLoyalty && order.customer">
      <div class="rcp-divider" />
      <div class="rcp-loyalty rcp-mb rcp-small rcp-center">
        <div v-if="Number(order.discount_amount) > 0">🎁 Loyalty discount applied: ₱{{ fmt(order.discount_amount) }}</div>
        <div v-else>Earn loyalty stamps with this order!</div>
      </div>
    </template>

    <!-- ── Notes ── -->
    <template v-if="order.notes">
      <div class="rcp-divider" />
      <div class="rcp-notes rcp-mb rcp-small">Note: {{ order.notes }}</div>
    </template>

    <!-- ── Footer ── -->
    <div class="rcp-divider" />
    <div class="rcp-footer rcp-center">{{ footer }}</div>

    <!-- Cut line -->
    <div class="rcp-cut">- - - - - - - - - - - - - - - -</div>
  </div>
</template>

<style scoped>
/*
  All styles use plain CSS — no Tailwind — for maximum print reliability.
  Designed for 80mm thermal paper (72mm printable with 4mm margins).
*/

.rcp {
  font-family: 'Courier New', Courier, monospace;
  font-size: 11px;
  line-height: 1.45;
  color: #000;
  background: #fff;
  width: 100%;
  padding: 8px 0;
}

/* ── Spacing ── */
.rcp-mb  { margin-bottom: 6px; }

/* ── Alignment ── */
.rcp-center { text-align: center; }
.rcp-mono   { font-family: 'Courier New', Courier, monospace; }

/* ── Header ── */
.rcp-shop-name {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  margin-bottom: 2px;
}
.rcp-small { font-size: 10px; color: #333; }

/* ── Dividers ── */
.rcp-divider {
  border: none;
  border-top: 1px dashed #888;
  margin: 5px 0;
}
.rcp-thin-line {
  border: none;
  border-top: 1px solid #ccc;
  margin: 3px 0;
}
.rcp-bold-divider {
  border: none;
  border-top: 2px solid #000;
  margin: 5px 0;
}

/* ── Order info ── */
.rcp-info {}
.rcp-info-row {
  display: flex;
  justify-content: space-between;
  gap: 4px;
  margin-bottom: 1px;
}
.rcp-lbl { color: #555; flex-shrink: 0; }
.rcp-val { text-align: right; word-break: break-all; }

/* ── Items ── */
.rcp-items-header {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: #555;
  padding-bottom: 2px;
}
.rcp-item { margin-bottom: 5px; }
.rcp-item-name {
  font-weight: 600;
  font-size: 11px;
  word-break: break-word;
}
.rcp-item-detail {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: #444;
  padding-left: 4px;
}
.rcp-item-total { font-weight: 600; color: #000; }

/* ── Totals ── */
.rcp-totals, .rcp-payments {}
.rcp-total-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 2px;
  font-size: 11px;
}
.rcp-change { font-weight: 700; }

/* ── Grand total ── */
.rcp-grand-total {
  display: flex;
  justify-content: space-between;
  font-size: 16px;
  font-weight: 700;
  padding: 3px 0;
}

/* ── Balance due ── */
.rcp-balance-due {
  text-align: center;
  border: 2px solid #000;
  padding: 5px 4px 4px;
  background: #f0f0f0;
}
.rcp-balance-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  margin-bottom: 2px;
}
.rcp-balance-amount {
  font-size: 20px;
  font-weight: 700;
  line-height: 1.2;
  margin-bottom: 2px;
}
.rcp-balance-note {
  font-size: 10px;
  font-weight: 600;
}

/* ── Loyalty / Notes ── */
.rcp-loyalty { color: #333; }
.rcp-notes   { color: #444; }
.rcp-ref     { font-size: 9px; }

/* ── Footer ── */
.rcp-footer {
  font-size: 11px;
  padding: 4px 0;
  font-weight: 600;
}
.rcp-cut {
  text-align: center;
  color: #aaa;
  font-size: 9px;
  margin-top: 8px;
  letter-spacing: 0.05em;
}
</style>
