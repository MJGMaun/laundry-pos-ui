<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <div class="bg-white border-b border-gray-200">
      <div class="max-w-3xl mx-auto px-6 py-8">
        <div class="flex items-center gap-3 mb-1">
          <img src="@/assets/logo-pos.png" alt="Laundry POS" class="h-8 w-auto" />
        </div>
        <h1 class="text-2xl font-bold text-gray-900 mt-4">Changelog</h1>
        <p class="text-gray-500 text-sm mt-1">All notable updates to The Laundry POS.</p>
      </div>
    </div>

    <!-- Versions -->
    <div class="max-w-3xl mx-auto px-6 py-10 space-y-10">
      <div v-for="version in changelog" :key="version.version" class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <!-- Version header -->
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="text-lg font-bold text-gray-900">v{{ version.version }}</span>
            <span v-if="version.latest" class="text-xs font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Latest</span>
          </div>
          <span class="text-sm text-gray-400">{{ version.date }}</span>
        </div>

        <!-- Sections -->
        <div class="divide-y divide-gray-50">
          <div v-for="section in version.sections" :key="section.title" class="px-6 py-4">
            <div class="flex items-center gap-2 mb-3">
              <span
                class="text-xs font-semibold px-2 py-0.5 rounded"
                :class="sectionTagClass(section.type)"
              >{{ section.title }}</span>
            </div>
            <ul class="space-y-1.5">
              <li
                v-for="(item, i) in section.items"
                :key="i"
                class="flex items-start gap-2 text-sm text-gray-700 leading-relaxed"
              >
                <span class="mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full" :class="dotClass(section.type)"></span>
                <span v-html="renderItem(item)"></span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const changelog = [
  {
    version: '1.14.0',
    date: 'June 30, 2026',
    latest: true,
    sections: [
      {
        title: 'New Features',
        type: 'feature',
        items: [
          '**Staff chat** — a new Messages page lets you chat with co-workers in your branch: search someone by username to start a direct message, or use the shared **branch group chat**. An unread badge on the sidebar shows how many new messages are waiting.',
        ],
      },
      {
        title: 'Improvements',
        type: 'improvement',
        items: [
          'Expenses: added a **search box** — filter by description or category name as you type',
          'Expenses: the month filter is now a **date-range picker** (like Orders), defaulting to the current month',
          'Orders: the **Unpaid filter** is now available to all roles (previously super admin only)',
          'POS: **GCash now supports partial payments** — the amount is editable (with a Full shortcut and quick ₱200/₱500/₱1000 chips), so you can take a GCash downpayment and leave the balance owing, matching Record Payment on Order Detail',
          'Orders list: partially-paid orders now show **₱paid / ₱total** (instead of just "Unpaid") so the outstanding balance is visible at a glance; fully-paid and unpaid orders keep the ✓ Paid / ⚠ Unpaid labels',
        ],
      },
    ],
  },
  {
    version: '1.13.0',
    date: 'June 24, 2026',
    latest: false,
    sections: [
      {
        title: 'New Features',
        type: 'feature',
        items: [
          'POS: the **loads · total chip** in Step 2 is now tappable — it opens an **Order Summary** showing every load with its price, its add-ons as badges underneath, and a full totals breakdown (subtotal, fees, loyalty discount, total) so you can review the cart without leaving the grid',
		  'Order Detail: Add Loads redesigned with a **two-pane layout** — service catalog on the left, a pinned **summary** on the right that lists each load with its add-ons and a running subtotal, with − qty + steppers for measured loads and add-ons',
		  'Order Detail: **Record Payment** now accepts **partial payments / downpayments** — the amount is editable with quick ₱200 / ₱500 / ₱1000 presets and a "Full balance" shortcut, and shows the **remaining balance** left after the payment',
        ],
      },
      {
        title: 'Improvements',
        type: 'improvement',
        items: [
          'Dashboard & Reports: **Top Customers now respects the selected date range** — it previously always showed all-time totals regardless of the period or dates set',
        ],
      },
      {
        title: 'Fixes',
        type: 'fix',
        items: [
          'Reports: **Service Performance revenue showed ₱0** — the table was reading the wrong field; revenue per service now displays correctly',
          'POS: after placing an order, dismissing the success popup could drop you back onto a stale review step showing **"Walk-in Customer"** — the flow now always resets to customer selection (a customer remains required for every order)',
        ],
      },
    ],
  },
  {
    version: '1.12.0',
    date: 'June 22, 2026',
    latest: false,
    sections: [
      {
        title: 'New Features',
        type: 'feature',
        items: [
          'POS: flat-rate services now add a **separate load per tap** (Wash #1, Wash #2…), so each load can carry its own add-ons and prints its own slip',
          'Add-ons now attach to a **specific load**: when you add an extra (Add Dry, Add Fabcon, etc.), it links to a load — auto-attaching when there\'s only one, or asking which one when there are several',
          'Tracking slips: add-ons no longer print their **own slip** — they\'re listed on the parent load\'s slip instead',
          'Receipts & Order Detail: add-ons are shown **indented under the load** they belong to',
          'Add Loads (Order Detail) supports the same add-on attachment, linking to existing or newly-added loads',
        ],
      },
    ],
  },
  {
    version: '1.11.1',
    date: 'June 22, 2026',
    latest: false,
    sections: [
      {
        title: 'New Features',
        type: 'feature',
        items: [
          'Reports: new **Loads** stat card showing the number of loads for the selected date range — counted the same way as the Dashboard (add-ons excluded)',
        ],
      },
      {
        title: 'Improvements',
        type: 'improvement',
        items: [
          'Order Detail: each payment now shows **when it was paid** (date and time) below its method',
          'Customers: editing a customer now **auto-capitalizes each word** in the Name and Address fields as you type — matching the POS new-customer form',
          'Expenses: the **description** is now visible on mobile — shown under the category for each row',
          'Expenses: **Edit / Delete** buttons no longer get cut off on mobile — the row now fits narrow screens, with the Cash/GCash tag tucked under the amount',
        ],
      },
      {
        title: 'Fixes',
        type: 'fix',
        items: [
          'Orders: the **load count** on the Orders list now matches the Dashboard — add-ons like **Add Dry** are no longer counted as loads, and per-order categories count once per order instead of summing every line',
        ],
      },
    ],
  },
  {
    version: '1.11.0',
    date: 'June 15, 2026',
    latest: false,
    sections: [
      {
        title: 'New Features',
        type: 'feature',
        items: [
          '**Machine Cycles** (admin): a new page to track how many wash/dry cycles each machine runs — add your washers and dryers, then log readings day by day',
          'Machine Cycles: logging is by **meter reading** — type the current total showing on each machine and the app works out how many cycles were added since the last reading, shown as a live **+N** badge beside the input; a reading below the previous total is blocked since a meter can\'t go backwards',
          'Machine Cycles: a **per-machine overview** shows each machine\'s cycles **this month** and **all time** at a glance',
          'Machine Cycles: when adding a machine you can set its **starting meter count**, so totals reflect cycles the machine already ran before it was added; an existing machine\'s starting count can be edited later from **Manage machines**',
        ],
      },
    ],
  },
  {
    version: '1.10.2',
    date: 'June 6, 2026',
    latest: false,
    sections: [
      {
        title: 'New Features',
        type: 'feature',
        items: [
          '**Pickup & Delivery toggle** (super admin): each branch can now have pickup & delivery turned on or off from Branch Management — when disabled, the POS hides pickup/delivery fee inputs, the Schedule page is removed from the sidebar, and the delivery card is hidden on Order Detail',
          '**POS Wizard**: redesigned POS flow into a guided 3-step wizard — Step 1: select customer, Step 2: choose services with inline quantity controls (tap to add, − and + to adjust, ✕ to remove), Step 3: review fees, notes, and totals before placing the order',
        ],
      },
      {
        title: 'Improvements',
        type: 'improvement',
        items: [
          'Order Detail: **Add Loads** and **Record Payment** are now modals — less clutter, easier to use on small screens',
          'Order Detail: layout reorganized — Loads on the left, a combined **Summary + Payments** card on the right; totals and payment history in one place',
          'Order Detail: cashiers and staff can now **Add Loads** without a "Failed to load services" error — the services endpoint is now accessible to all roles',
          'Order Detail: **Add Loads** redesigned as a service catalog — 2-column card grid with category tabs, tap to add, inline − qty + controls on selected cards, and a running summary of selections; replaces the old dropdown rows',
          'POS: **customer selection is now required** — the walk-in shortcut is removed; staff must always search for or create a customer before proceeding',
          'POS: typing a name with no matching results shows a **"Create \'[name]\'"** prompt — tapping it opens a modal with the name pre-filled; the "+ New Customer" button also opens the same modal',
          'POS: **Fees & notes** section is now collapsed by default — tap to expand when needed',
          'POS: tapping **New Order** after a successful checkout returns to Step 1 (customer selection)',
          'Day Summary: now restricted to **admin** only',
          'Settings: **Loyalty Program** section removed (points per peso, min redeem) — stamp-based loyalty rules still work as before',
          'Customer Detail: loyalty tier badge removed',
        ],
      },
      {
        title: 'Fixes',
        type: 'fix',
        items: [
          'POS: tracking slip now correctly shows **paid/unpaid status** — was always showing unpaid even on fully paid orders because the slip rendered before payments were recorded',
          'Customers: **Total Spent now decreases when an order is deleted** — deleting an order now reverses the net paid amount from the customer\'s total',
        ],
      },
    ],
  },
  {
    version: '1.10.0',
    date: 'June 4, 2026',
    latest: false,
    sections: [
      {
        title: 'New Features',
        type: 'feature',
        items: [
          '**Schedule View** (admin): a dedicated page showing today\'s pickups and deliveries — browse by date, one-tap to mark as picked up or delivered, with separate pending and done sections',
          '**Pickup Booking**: schedule a pre-order pickup for a customer before any laundry arrives — set customer, date/time window, address, and notes; driver marks it picked up when done; the actual order is created separately once the laundry is at the shop',
          '**Delivery Tracking**: admins can schedule a delivery date/time on any order from the Order Detail page and mark it as delivered when done — delivery timestamp is recorded and shown on the order',
        ],
      },
      {
        title: 'Improvements',
        type: 'improvement',
        items: [
          'Delivered orders skip the **Claimed** status — advancing goes directly **Ready → Completed** since the driver already brought the laundry to the customer',
          'Pickup and delivery date/time pickers block past dates and times',
		  'POS Payment: **Amount is now display-only** — cashier no longer needs to type it, it\'s always the order total',
          'POS Payment: **Quick-amount buttons** replace the tendered input — tap Exact, any standard PH denomination (₱20 · ₱50 · ₱100 · ₱200 · ₱500 · ₱1000), or Custom to enter a different amount; selected button is highlighted and change updates instantly',
        ],
      },
    ],
  },
  {
    version: '1.9.1',
    date: 'June 3, 2026',
    latest: false,
    sections: [
      {
        title: 'Improvements',
        type: 'improvement',
        items: [
          'Loyalty: stamp display on receipts and customer profile now shows **cycle progress (e.g. 7/10)** instead of the all-time total — so customers see how close they are to their next free load',
        ],
      },
      {
        title: 'New Features',
        type: 'feature',
        items: [
          'Loyalty: when creating a new loyalty rule, admin can choose to **reset all customer stamp balances** (start fresh) or carry them over — resets are fully auditable and no data is deleted',
          'Offline: **Customers list now works without internet** — loads from local cache with name/phone search, matching the existing offline support for POS, Orders, and Pickup Queue',
          'Offline: **orders created while offline now appear immediately in the Orders list** with an orange ⏳ "Not synced" badge — they sync automatically when back online and the badge disappears',
          'Offline: **Order Detail is now fully offline-capable** — opening an order loads from local cache when offline; status advances, reverts, and payments all work offline and queue for sync; local cache is updated immediately so changes persist across page reloads',
        ],
      },
      {
        title: 'Fixes',
        type: 'fix',
        items: [
          'Offline: **reloading the browser while offline no longer logs you out** — the session is now restored from local cache; only a real auth failure (invalid token) clears the session',
          'Order Detail: **"Failed to load order" error on every open** — a Dexie cache write inside the try/catch was swallowing load errors; moved outside so it can never interfere',
          'Offline: **duplicate payments when tapping Record multiple times** — added a synchronous re-entry guard so only one payment submission can run at a time regardless of render timing',
          'Offline: **recorded payment disappeared on page refresh** — Vue reactive proxies were silently failing the IndexedDB write; cache now deep-clones to plain JS before storing, so offline payments survive a reload and no longer duplicate on sync',
          'Offline: **order list showed stale status after updating in order detail** — list now overlays locally queued status changes on top of server results so both views stay in sync before the queue flushes',
        ],
      },
    ],
  },
  {
    version: '1.9.0',
    date: 'May 31, 2026',
    latest: false,
    sections: [
      {
        title: 'New Features',
        type: 'feature',
        items: [
          '**Day Summary**: a printable end-of-day remittance slip for all roles — prints today\'s Cash/GCash To Remit with each payment\'s customer, order number, and the date the order was made (can be turned on/off per branch)',
          'Cash Balance: a **Payments This Day** breakdown lists every payment for the date — customer, order number, order date, method, amount, and paid time — so totals and To Remit reconcile line by line',
        ],
      },
      {
        title: 'Improvements',
        type: 'improvement',
        items: [
          'Reports: Top Customers rows are now **clickable** and open the customer\'s profile',
          'Customer Detail: the loyalty stamp card is hidden when the branch has **no active loyalty**',
          'Dashboard: **Loads** now counts per a configurable per-category rule (Per quantity / 1 load per order / Not a load), set in Services → Categories',
        ],
      },
      {
        title: 'Fixes',
        type: 'fix',
        items: [
          'Reports & Dashboard: Top Customers **Total Spent** now reflects the actual amount paid (matching the customer profile), not order totals that included unpaid balances',
          'Dashboard: Cash on Hand now uses **today\'s local date** instead of UTC, which after midnight was off by a day',
          'POS: the cart quantity up/down arrows now step by **1** (or 0.5 for per-kilo) instead of 0.1',
        ],
      },
    ],
  },
  {
    version: '1.8.0',
    date: 'May 30, 2026',
    latest: false,
    sections: [
      {
        title: 'New Features',
        type: 'feature',
        items: [
          'Loyalty: receipts now show the customer\'s current stamp count — on both the on-screen preview and the printed receipt (when "Show loyalty on receipt" is enabled)',
          'Loyalty: admin can manually adjust a customer\'s stamp balance from their profile — add or remove stamps, or set an exact total, with an optional reason',
          'Orders: a claimed order is now marked **Completed automatically** once it\'s fully paid — no more manual Complete tap',
          'Dashboard: new **Loads Today** stat card (total laundry loads) in place of Orders Today',
          'Dashboard: the **Daily / Weekly / Monthly** filter now applies to the whole dashboard — Revenue, Loads, and Expenses reflect the selected period, and the header shows the exact date range included',
		  'Loyalty: deleting an order now automatically **removes the stamps it earned** from the customer\'s balance (never going below zero)',
        ],
      },
      {
        title: 'Improvements',
        type: 'improvement',
        items: [
          'Reports: **revenue is now recognized on the day an order is created** (not the day it\'s paid) — across the dashboard, revenue trend, Profit & Loss, Top Customers, and Service Mix',
          'Dashboard: **Uncollected** now includes pending orders and shows the true outstanding balance — partial payments reduce it and a fully-paid order drops to zero',
        ],
      },
      {
        title: 'Fixes',
        type: 'fix',
        items: [
          'Settings: enabling "Show loyalty on receipt" no longer fails with a "value must be true or false" error',
        ],
      },
    ],
  },
  {
    version: '1.7.0',
    date: 'May 27, 2026',
    latest: false,
    sections: [
      {
        title: 'New Features',
        type: 'feature',
        items: [
          'Customers: duplicate name or phone number within the same branch is now blocked — error shown inline under the offending field in both the POS new customer form and the Customers admin form',
        ],
      },
    ],
  },
  {
    version: '1.6.0',
    date: 'May 27, 2026',
    latest: false,
    sections: [
      {
        title: 'Offline Mode',
        type: 'feature',
        items: [
          'POS and Orders now work offline — services, orders (last 7 days), customers, service categories, and branch settings are cached to device storage on every login and app startup',
          'Orders list loads from local cache when offline, with status and search filtering',
          'Service category tabs populate offline even when category data is missing from the service embed',
          'Offline cache refreshes automatically on login, app startup, reconnect, and branch switch',
        ],
      },
      {
        title: 'Fixes',
        type: 'fix',
        items: [
          'Android: login no longer fails with "Invalid credentials" — the API middleware was incorrectly requiring a CSRF token for Bearer token requests from the mobile app',
          'Android: all API requests now reach the server correctly — the WebView origin (https://localhost) was missing from the CORS allowed list',
          'Offline: services were never actually saved to cache — a boolean type mismatch caused the backend to return inactive services only, leaving the offline service list empty',
        ],
      },
    ],
  },
  {
    version: '1.5.0',
    date: 'May 27, 2026',
    latest: false,
    sections: [
      {
        title: 'New Features',
        type: 'feature',
        items: [
          'Service category icons (emoji) can now be set per category and display on POS cards and category tabs',
          'POS: payment modal auto-detects pay-later / down payment / full payment from tendered amount — no manual toggle needed',
          'Reports: uncollected revenue (completed orders with outstanding balance) now shown in sales summary and P&L',
          'Customers: admin can now soft-delete a customer; order history is preserved; visiting a removed profile shows a "Customer Removed" screen',
          'Orders: status can be reverted one step backward by admin via an "← Undo" button on Order Detail',
          'Dashboard: Top Customers rows are now clickable and navigate to the customer\'s profile',
          'Dashboard: Expenses Today and Cash on Hand stat cards added',
          'Payments: **Exact** button added to Order Detail payment form and Customer Detail Pay All modal',
          'Receipt: footer now states "This is not an official receipt"',
          'Android: app now uses bluetooth-le plugin for more reliable BLE printer connectivity',
          'App now live at thelaundrypos.com; API at api.thelaundrypos.com via Cloudflare',
        ],
      },
      {
        title: 'Improvements',
        type: 'improvement',
        items: [
          'Reports: revenue figures now only include paid amounts — unpaid balances excluded from totals',
          'Orders: balance due and notes now shown prominently in the Order Detail header; notes support inline editing',
          'Orders: quick-select note tags added (No spray, Med temp only, Has eco bag, Has basket, etc.)',
          'Customers: clicking a customer name in the order list navigates directly to their profile',
          'Customers: total_spent now increments on every payment including downpayments; refunds decrement accordingly',
          'Tracking Slip: order notes now print below the date on each slip',
          'Dashboard: replaced Avg Order and Top Service stat cards with Expenses Today and Cash on Hand',
        ],
      },
      {
        title: 'POS',
        type: 'page',
        items: [
          'Service cards redesigned — price enlarged and moved to top-right; check badge repositioned; hover shows remove (✕) hint on selected services',
          'Payment modal UX overhauled — stepped layout (Customer → Payment), cleaner method tabs, better change display',
          'Services in catalog now sorted by category, then alphabetically within each category',
          'Tapping outside the order success modal closes it',
        ],
      },
      {
        title: 'Orders',
        type: 'page',
        items: [
          'Status "to_collect" renamed to "claimed" across the entire app (UI labels, badge styles, API validation, and database ENUM)',
        ],
      },
      {
        title: 'Tracking Slip',
        type: 'page',
        items: [
          'Removed "TRACKING SLIP" header label and load ID from the slip',
        ],
      },
      {
        title: 'Fixes',
        type: 'fix',
        items: [
          'Reports: revenue queries correctly scoped to paid orders only',
          'Reports: Service Mix chart now reads the correct total_revenue field',
          'Android: removed server.url from capacitor config so production APK calls the live API instead of localhost',
          'Receipt: Bluetooth unavailable error message improved with HTTP workaround hint',
          'Receipt: balance due section no longer appears on fully paid orders; correct remaining balance shown for partial payments',
          'Dates: all date pickers now send the correct local date — previously caused a 1-day offset for UTC+8 users',
          'Orders: customer relationship now loads with withTrashed() so removed customers still appear in order history',
          'Orders: migration back-fills existing to_collect rows and updates MySQL ENUM to fix data truncation error',
          'Cash Balance: negative "To Remit" now displays as -₱4,858.00 instead of ₱-4,858.00',
          'Cash Balance: GCash expenses now deducted from "To Remit (GCash)"; cash expenses continue to reduce drawer total',
          'Expenses: payment method (Cash or GCash) can now be selected when logging or editing an expense; method badge shown in table',
        ],
      },
    ],
  },
  {
    version: '1.4.0',
    date: 'May 25, 2026',
    latest: false,
    sections: [
      {
        title: 'New Features',
        type: 'feature',
        items: [
          'Bluetooth thermal printer support via Web Bluetooth (BLE GATT); works on Chrome/Edge over HTTPS or localhost',
          'Tracking Slip: per-load Print Slip button in Order Detail; prints quantity copies automatically',
          'Tracking Slip: unpaid slips now show the outstanding balance below the [UNPAID] status',
          'Tracking Slip: slips for loads with quantity > 1 are now numbered (e.g. #ABC-1, #ABC-2) for easier identification',
          'POS: manual Print Slips button added to the order success modal; tracking slips no longer auto-print on order creation',
        ],
      },
      {
        title: 'Receipt',
        type: 'page',
        items: [
          'Pay-later orders now print a prominent BALANCE DUE section showing the outstanding amount and a "Please pay upon pickup." reminder — on both thermal receipt and on-screen preview',
        ],
      },
      {
        title: 'Fixes',
        type: 'fix',
        items: [
          'Graceful error message when Web Bluetooth is unavailable (HTTP context) instead of unhandled crash',
        ],
      },
    ],
  },
  {
    version: '1.3.0',
    date: 'May 24, 2026',
    latest: false,
    sections: [
      {
        title: 'New Features',
        type: 'feature',
        items: [
          'Reports: cash balance now shows starting float (₱2,000 sample) and computes "To Remit" net of starting cash; daily expenses reflected in balance',
          'Customers: overview of total unpaid amount per customer; list of unpaid orders with toggle to switch between unpaid/paid view',
          'Payments: GCash payments now accept an optional transaction reference number (POS, Order Detail, Customer Detail)',
        ],
      },
      {
        title: 'Improvements',
        type: 'improvement',
        items: [
          'Reports: weekly date filter now starts on Monday; highlights the selected week',
        ],
      },
      {
        title: 'Orders',
        type: 'page',
        items: [
          'Date filter replaced with a single date-range picker instead of separate From/To inputs',
          'Order statuses redefined — Pending: order received not yet done; Ready: done awaiting pickup or delivery; To Collect: picked up or delivered payment not yet collected; Completed: done picked up/delivered and paid',
        ],
      },
      {
        title: 'Removed',
        type: 'removed',
        items: [
          'Pickup queue screen',
          'Unpaid tab from Orders view',
        ],
      },
    ],
  },
  {
    version: '1.2.0',
    date: 'May 24, 2026',
    latest: false,
    sections: [
      {
        title: 'New Features',
        type: 'feature',
        items: [
          'Orders: delete function for admin; cashiers can only delete within 15 minutes of creation',
          'Orders: support for loads with quantity input (loyalty-aware)',
          'Orders: unpaid status now visible on order list',
          'POS: services can be unticked/deselected after being added',
        ],
      },
      {
        title: 'Improvements',
        type: 'improvement',
        items: [
          'POS: payments tendered the same day on a pay-later order now accumulate correctly on final payment',
          'Orders: alert shown when attempting to mark as delivered/picked up while payment is outstanding',
        ],
      },
    ],
  },
  {
    version: '1.0.0',
    date: 'May 2026',
    latest: false,
    sections: [
      {
        title: 'New Features',
        type: 'feature',
        items: ['Initial release'],
      },
    ],
  },
]

function sectionTagClass(type) {
  return {
    feature:     'bg-green-100 text-green-700',
    improvement: 'bg-blue-100 text-blue-700',
    page:        'bg-purple-100 text-purple-700',
    fix:         'bg-red-100 text-red-700',
    removed:     'bg-gray-100 text-gray-600',
  }[type] ?? 'bg-gray-100 text-gray-600'
}

function dotClass(type) {
  return {
    feature:     'bg-green-400',
    improvement: 'bg-blue-400',
    page:        'bg-purple-400',
    fix:         'bg-red-400',
    removed:     'bg-gray-400',
  }[type] ?? 'bg-gray-400'
}

function renderItem(text) {
  return text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
}
</script>
