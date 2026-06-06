<script setup>
import { ref, computed, onMounted, watch, watchEffect } from 'vue';
import { useCartStore } from '@/stores/cart.js';
import { useBranchStore } from '@/stores/branch.js';
import { useSettingsStore } from '@/stores/settings.js';
import { useQueueStore } from '@/stores/queue.js';
import { useToast } from 'primevue/usetoast';
import { getServices } from '@/api/services.js';
import { getBranchServices } from '@/api/branches.js';
import { getCustomers } from '@/api/customers.js';
import { createOrder } from '@/api/orders.js';
import { createPayment } from '@/api/payments.js';
import {
    getCustomerLoyalty,
    redeemReward as redeemRewardApi,
} from '@/api/loyalty.js';
import { isOfflineError } from '@/offline/isOfflineError.js';
import { db } from '@/offline/db.js';
import { useRouter } from 'vue-router';
import Dialog from 'primevue/dialog';
import ReceiptModal from '@/components/receipt/ReceiptModal.vue';
import { usePrinter } from '@/composables/usePrinter.js';
import { buildTrackingSlipBytes } from '@/utils/escpos.js';

const cart = useCartStore();
const branch = useBranchStore();
const settings = useSettingsStore();
const queue = useQueueStore();
const toast = useToast();
const router = useRouter();
const printer = usePrinter();

const allServices = ref([]);
const categories = ref([]);
const activeCategory = ref(null);
const loadingServices = ref(false);

const customerQuery = ref('');
const customerResults = ref([]);
const searchingCustomer = ref(false);
const showNewCustomerForm = ref(false);
const newCustomer = ref({ name: '', phone: '', address: '' });
const phoneError = ref('');
const nameError = ref('');
const displayPhone = ref('');

function onPhoneInput(e) {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 11);
    newCustomer.value.phone = raw;
    if (raw.length <= 4) displayPhone.value = raw;
    else if (raw.length <= 7)
        displayPhone.value = raw.slice(0, 4) + '-' + raw.slice(4);
    else
        displayPhone.value =
            raw.slice(0, 4) + '-' + raw.slice(4, 7) + '-' + raw.slice(7);
}

function capitalizeField(field) {
    if (newCustomer.value[field]) {
        newCustomer.value[field] = newCustomer.value[field].replace(/\b\w/g, (c) => c.toUpperCase());
    }
}

function validatePhone(phone) {
    return /^\d{11}$/.test(phone);
}
const savingCustomer = ref(false);

const showPayment = ref(false);
const payments = ref([
    { method: 'cash', amount: '', tendered: '', reference_number: '' },
]);
const paymentError = ref('');
const processingPayment = ref(false);

const effectiveTendered = computed(() =>
    payments.value.reduce(
        (s, p) =>
            s +
            (p.method === 'cash'
                ? Number(p.tendered || 0)
                : Number(p.amount || 0)),
        0
    )
);
const confirmLabel = computed(() => {
    if (effectiveTendered.value < 0.01) return 'Create Order (Pay Later)';
    if (effectiveTendered.value < cart.total - 0.01)
        return 'Record Down Payment';
    return 'Confirm Payment';
});

const lastOrder = ref(null);
const showSuccess = ref(false);
const lastRedeemedReward = ref(null);
const receiptOrderId = ref(null);
const printingSlips = ref(false);

const customerLoyalty = ref(null);
const selectedReward = ref(null);

// ── Wizard step ─────────────────────────────────────────────────────────────
const currentStep = ref(1);

function stepState(n) {
    if (currentStep.value > n) return 'done';
    if (currentStep.value === n) return 'active';
    return 'future';
}

// ── Services ─────────────────────────────────────────────────────────────────
const filteredServices = computed(() => {
    const active = allServices.value.filter((s) => s.is_active !== false);
    if (!activeCategory.value) return active;
    return active.filter((s) => s.category_id === activeCategory.value);
});

const serviceEmoji = (svc) => {
    if (svc.category?.icon) return svc.category.icon;
    const name = (svc.category?.name || '').toLowerCase();
    if (name.includes('dry')) return '👔';
    if (name.includes('press') || name.includes('iron')) return '🧹';
    if (name.includes('special')) return '✨';
    if (name.includes('express')) return '⚡';
    return '🧺';
};

const categoryEmoji = (cat) => {
    if (cat?.icon) return cat.icon;
    const name = (typeof cat === 'string' ? cat : cat?.name || '').toLowerCase();
    if (name.includes('dry')) return '👔';
    if (name.includes('press')) return '🧹';
    if (name.includes('special')) return '✨';
    if (name.includes('express')) return '⚡';
    return '🧺';
};

async function loadServices() {
    loadingServices.value = true;
    try {
        let services = [];
        try {
            if (branch.currentBranchId) {
                try {
                    const res = await getBranchServices(branch.currentBranchId);
                    services = res.data.data || res.data;
                } catch {
                    const res = await getServices();
                    services = res.data.data || res.data;
                }
            } else {
                const res = await getServices();
                services = res.data.data || res.data;
            }
        } catch (e) {
            if (!isOfflineError(e)) throw e;
            const branchId = branch.currentBranchId ? Number(branch.currentBranchId) : null;
            if (branchId) {
                services = await db.services.where('branch_id').equals(branchId).toArray();
            }
            if (!services.length) {
                services = await db.services.toArray();
            }
        }
        allServices.value = services.slice().sort((a, b) => {
            if (a.category_id === b.category_id) return a.name.localeCompare(b.name);
            if (a.category_id == null) return 1;
            if (b.category_id == null) return -1;
            return a.category_id - b.category_id;
        });
        const catMap = new Map();
        services.forEach((s) => {
            if (s.category && !catMap.has(s.category_id))
                catMap.set(s.category_id, s.category);
        });
        if (catMap.size === 0 || services.some((s) => s.category_id && !s.category)) {
            const dbCats = await db.service_categories.toArray();
            dbCats.forEach((c) => { if (!catMap.has(c.id)) catMap.set(c.id, c); });
        }
        categories.value = Array.from(catMap.values());
    } finally {
        loadingServices.value = false;
    }
}

let searchTimer = null;
watch(customerQuery, (val) => {
    clearTimeout(searchTimer);
    if (!val || val.length < 2) {
        customerResults.value = [];
        return;
    }
    searchTimer = setTimeout(async () => {
        searchingCustomer.value = true;
        try {
            const res = await getCustomers({ search: val, per_page: 6 });
            customerResults.value = res.data.data || res.data;
        } catch (e) {
            if (!isOfflineError(e)) throw e;
            const q = val.toLowerCase();
            const branchId = branch.currentBranchId ? Number(branch.currentBranchId) : null;
            customerResults.value = await db.customers
                .filter((c) => {
                    if (branchId && c.branch_id !== branchId) return false;
                    return c.name?.toLowerCase().includes(q) || c.phone?.includes(val);
                })
                .limit(6)
                .toArray();
        } finally {
            searchingCustomer.value = false;
        }
    }, 300);
});

async function selectCustomer(c) {
    cart.setCustomer(c);
    cart.clearLoyaltyReward();
    customerQuery.value = '';
    customerResults.value = [];
    selectedReward.value = null;
    customerLoyalty.value = null;
    // Auto-advance to services step
    currentStep.value = 2;
    try {
        const res = await getCustomerLoyalty(c.id);
        customerLoyalty.value = res.data;
    } catch {}
}

watchEffect(() => {
    const loyalty = customerLoyalty.value;
    if (!loyalty || !cart.items.length) {
        cart.clearLoyaltyReward();
        selectedReward.value = null;
        return;
    }

    const existingCount = loyalty.pending_rewards.filter(
        (r) => r.rule?.reward_type === 'free_load'
    ).length;

    const cartStamps = Math.floor(
        cart.items
            .filter((i) => i.is_loyalty_eligible)
            .reduce((s, i) => s + Number(i.quantity), 0)
    );
    const prospective = loyalty.total_stamps + cartStamps;
    const newCount = loyalty.rules
        .filter((r) => r.reward_type === 'free_load')
        .reduce((sum, rule) => {
            const prev = Math.floor(loyalty.total_stamps / rule.every_n_stamps);
            const next = Math.floor(prospective / rule.every_n_stamps);
            return sum + Math.max(0, next - prev);
        }, 0);

    const totalFreeLoads = existingCount + newCount;

    if (totalFreeLoads === 0) {
        cart.clearLoyaltyReward();
        selectedReward.value = null;
        return;
    }

    const expandedPrices = cart.items
        .flatMap((i) => Array(Math.floor(i.quantity)).fill(i.unit_price))
        .sort((a, b) => b - a);
    const discount = expandedPrices.slice(0, totalFreeLoads).reduce((s, p) => s + p, 0);

    cart.applyLoyaltyReward({ count: totalFreeLoads }, discount);
    selectedReward.value = cart.appliedLoyaltyReward;
});

function createWithQuery() {
    newCustomer.value.name = customerQuery.value.trim()
        .replace(/\b\w/g, (c) => c.toUpperCase());
    showNewCustomerForm.value = true;
}

async function saveNewCustomer() {
    phoneError.value = '';
    nameError.value = '';
    if (!validatePhone(newCustomer.value.phone)) {
        phoneError.value = 'Phone must be exactly 11 digits.';
        return;
    }
    savingCustomer.value = true;
    try {
        const { createCustomer } = await import('@/api/customers.js');
        const res = await createCustomer(newCustomer.value);
        const customer = res.data.data || res.data;
        await db.customers.put({
            ...customer,
            branch_id: Number(localStorage.getItem('branch_id')) || customer.branch_id,
        });
        selectCustomer(customer);
        showNewCustomerForm.value = false;
        newCustomer.value = { name: '', phone: '', address: '' };
        phoneError.value = '';
        nameError.value = '';
        displayPhone.value = '';
    } catch (e) {
        if (isOfflineError(e)) {
            const tempId = 'offline_' + Date.now();
            const tempCustomer = {
                id: tempId,
                name: newCustomer.value.name,
                phone: newCustomer.value.phone,
                address: newCustomer.value.address || '',
                branch_id: Number(localStorage.getItem('branch_id')) || 0,
                loyalty_points: 0,
                total_visits: 0,
                total_spent: '0.00',
                _offline: true,
            };
            await db.customers.put(tempCustomer);
            await queue.enqueueCustomer(newCustomer.value, tempId);
            selectCustomer(tempCustomer);
            showNewCustomerForm.value = false;
            newCustomer.value = { name: '', phone: '', address: '' };
            phoneError.value = '';
            displayPhone.value = '';
            toast.add({ severity: 'warn', summary: 'Saved offline', detail: 'Customer queued — will sync when connected', life: 5000 });
        } else {
            const errors = e.response?.data?.errors || {};
            if (errors.name) nameError.value = errors.name[0];
            if (errors.phone) phoneError.value = errors.phone[0];
            if (!errors.name && !errors.phone)
                toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to save customer', life: 4000 });
        }
    } finally {
        savingCustomer.value = false;
    }
}

const paymentTotal = computed(() =>
    payments.value.reduce((s, p) => s + Number(p.amount || 0), 0)
);
const remainingAfterPayments = computed(() =>
    Math.max(0, cart.total - paymentTotal.value)
);

function openPayment() {
    const total = cart.total.toFixed(2);
    payments.value = [{ method: 'cash', amount: total, tendered: '', reference_number: '', showCustom: false }];
    paymentError.value = '';
    showPayment.value = true;
}

function addPaymentRow() {
    payments.value.push({
        method: 'gcash',
        amount: String(remainingAfterPayments.value.toFixed(2)),
        tendered: '',
        reference_number: '',
        showCustom: false,
    });
}

function quickAmounts() {
    return [0, 20, 50, 100, 200, 500, 1000];
}

async function printOrderSlips(order) {
    if (!order) return;
    const loads = order.loads || [];
    if (!loads.length) return;
    printingSlips.value = true;
    try {
        if (!printer.connected.value) {
            const ok = await printer.connect();
            if (!ok) {
                toast.add({ severity: 'error', summary: 'Printer', detail: 'Could not connect to printer', life: 4000 });
                return;
            }
        }
        const { getSettings } = await import('@/api/settings.js');
        const settingsRes = await getSettings();
        const arr = settingsRes.data.settings || [];
        const settings = {};
        arr.forEach((s) => { settings[s.key] = s.value; });
        const totalSlips = loads.reduce((s, l) => s + Math.max(1, Math.floor(Number(l.quantity) || 1)), 0);
        for (const load of loads) {
            const copies = Math.max(1, Math.floor(Number(load.quantity) || 1));
            for (let i = 0; i < copies; i++) {
                const slipBytes = buildTrackingSlipBytes(load, order, settings, i + 1, copies);
                await printer.print(slipBytes);
                if (i < copies - 1) await new Promise((r) => setTimeout(r, 400));
            }
        }
        toast.add({ severity: 'success', summary: 'Printed', detail: `${totalSlips} tracking slip${totalSlips !== 1 ? 's' : ''} sent`, life: 2500 });
    } catch (e) {
        toast.add({ severity: 'error', summary: 'Print error', detail: e.message || 'Failed to print slips', life: 4000 });
    } finally {
        printingSlips.value = false;
    }
}

async function processPayment() {
    if (!cart.items.length) { paymentError.value = 'Cart is empty.'; return; }
    processingPayment.value = true;
    paymentError.value = '';
    const clientId = crypto.randomUUID
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
              const r = (Math.random() * 16) | 0;
              return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
          });
    try {
        const orderRes = await createOrder({
            client_id: clientId,
            customer_id: cart.customer?.id || null,
            loads: cart.items.map((i) => ({ service_id: i.service_id, quantity: i.quantity, notes: '' })),
            notes: cart.notes || '',
            pickup_fee: cart.pickupFee || 0,
            delivery_fee: cart.deliveryFee || 0,
            discount_amount: cart.loyaltyDiscount || 0,
            loyalty_free_loads: cart.appliedLoyaltyReward?.count || 0,
        });
        const order = orderRes.data.data || orderRes.data;

        for (const p of payments.value) {
            if (p.method === 'cash') {
                const tendered = Number(p.tendered || 0);
                if (tendered <= 0) continue;
                const amount = Math.min(tendered, Number(p.amount || tendered));
                await createPayment(order.id, { method: 'cash', amount, tendered, type: 'payment' });
            } else {
                const amount = Number(p.amount || 0);
                if (amount <= 0) continue;
                await createPayment(order.id, { method: p.method, amount, type: 'payment', reference_number: p.reference_number || '' });
            }
        }

        const totalPaid = payments.value.reduce((sum, p) => {
            if (p.method === 'cash') {
                const t = Number(p.tendered || 0);
                return t > 0 ? sum + Math.min(t, Number(p.amount || t)) : sum;
            }
            const a = Number(p.amount || 0);
            return a > 0 ? sum + a : sum;
        }, 0);
        lastOrder.value = { ...order, paid_amount: totalPaid };
        lastRedeemedReward.value = cart.appliedLoyaltyReward;
        cart.clear();
        customerLoyalty.value = null;
        selectedReward.value = null;
        showPayment.value = false;
        showSuccess.value = true;
    } catch (e) {
        if (isOfflineError(e)) {
            const isOfflineCustomer = !!cart.customer?._offline;
            const orderData = {
                client_id: clientId,
                customer_id: isOfflineCustomer ? null : cart.customer?.id || null,
                ...(isOfflineCustomer && { offline_customer_temp_id: cart.customer.id }),
                loads: cart.items.map((i) => ({ service_id: i.service_id, quantity: i.quantity, notes: '' })),
                notes: cart.notes || '',
                pickup_fee: cart.pickupFee || 0,
                delivery_fee: cart.deliveryFee || 0,
            };
            const payableRows = payments.value.flatMap((p) => {
                if (p.method === 'cash') {
                    const tendered = Number(p.tendered || 0);
                    if (tendered <= 0) return [];
                    return [{ method: 'cash', amount: Math.min(tendered, Number(p.amount || tendered)), tendered, type: 'payment' }];
                } else {
                    const amount = Number(p.amount || 0);
                    if (amount <= 0) return [];
                    return [{ method: p.method, amount, type: 'payment', reference_number: p.reference_number || '' }];
                }
            });
            const offlineId = 'offline_' + Date.now();
            const displayOrder = {
                id: offlineId,
                order_number: offlineId,
                branch_id: Number(localStorage.getItem('branch_id')) || 0,
                customer: cart.customer && !cart.customer._offline
                    ? { id: cart.customer.id, name: cart.customer.name }
                    : cart.customer?._offline ? { name: cart.customer.name } : null,
                status: 'pending',
                total_amount: cart.total,
                paid_amount: payableRows.reduce((s, p) => s + p.amount, 0),
                loads_count: cart.items.reduce((s, i) => s + Number(i.quantity), 0),
                created_at: new Date().toISOString(),
            };
            await queue.enqueueOrder(orderData, payableRows, null, displayOrder);
            cart.clear();
            showPayment.value = false;
            toast.add({ severity: 'warn', summary: 'Saved offline', detail: 'Order queued — will sync when connected', life: 6000 });
        } else {
            paymentError.value = e.response?.data?.message || 'Failed to process order.';
        }
    } finally {
        processingPayment.value = false;
    }
}

function fmt(n) {
    return Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPrice(svc) {
    const p = Number(svc.price);
    if (svc.pricing_type === 'per_kilo') return `₱${p}/kg`;
    if (svc.pricing_type === 'per_piece') return `₱${p}/pc`;
    return `₱${p}`;
}

const cartItemCount = computed(() => cart.items.reduce((s, i) => s + i.quantity, 0));
const inCart = (serviceId) => cart.items.some((i) => i.service_id === serviceId);
const cartQty = (svc) => cart.items.find((i) => i.service_id === svc.id)?.quantity ?? 0;

onMounted(loadServices);
watch(() => branch.currentBranchId, loadServices);
</script>

<template>
    <div class="flex h-full flex-col overflow-hidden bg-slate-50">

        <!-- ───── Step Indicator ───── -->
        <div class="shrink-0 border-b border-slate-200 bg-white px-4 py-3">
            <div class="flex items-center justify-center">
                <!-- Step 1 -->
                <div class="flex flex-col items-center gap-1">
                    <div class="step-circle" :class="`step-${stepState(1)}`">
                        <svg v-if="stepState(1) === 'done'" class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                        </svg>
                        <span v-else>1</span>
                    </div>
                    <span class="text-[11px] font-semibold" :class="stepState(1) === 'future' ? 'text-slate-400' : 'text-slate-700'">Customer</span>
                </div>

                <!-- Connector -->
                <div class="mb-4 mx-2 h-0.5 flex-1 max-w-[80px] rounded-full transition-colors duration-300"
                    :class="currentStep > 1 ? 'bg-green-400' : 'bg-slate-200'" />

                <!-- Step 2 -->
                <div class="flex flex-col items-center gap-1">
                    <div class="step-circle" :class="`step-${stepState(2)}`">
                        <svg v-if="stepState(2) === 'done'" class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                        </svg>
                        <span v-else>2</span>
                    </div>
                    <span class="text-[11px] font-semibold" :class="stepState(2) === 'future' ? 'text-slate-400' : 'text-slate-700'">Services</span>
                </div>

                <!-- Connector -->
                <div class="mb-4 mx-2 h-0.5 flex-1 max-w-[80px] rounded-full transition-colors duration-300"
                    :class="currentStep > 2 ? 'bg-green-400' : 'bg-slate-200'" />

                <!-- Step 3 -->
                <div class="flex flex-col items-center gap-1">
                    <div class="step-circle" :class="`step-${stepState(3)}`">
                        <span>3</span>
                    </div>
                    <span class="text-[11px] font-semibold" :class="stepState(3) === 'future' ? 'text-slate-400' : 'text-slate-700'">Review</span>
                </div>
            </div>
        </div>

        <!-- ───── Step Content ───── -->
        <div class="flex min-h-0 flex-1 flex-col overflow-hidden">

            <!-- ══ STEP 1: Customer ══ -->
            <Transition name="step-fade" mode="out-in">
            <div v-if="currentStep === 1" key="step1" class="flex flex-1 flex-col overflow-y-auto">
                <div class="flex flex-1 flex-col items-center justify-center gap-5 p-6 sm:p-10">

                    <div class="text-center">
                        <div class="mb-3 text-5xl">👤</div>
                        <h2 class="text-xl font-bold text-slate-800 sm:text-2xl">Who's the customer?</h2>
                        <p class="mt-1 text-sm text-slate-400">Search by name or phone number</p>
                    </div>

                    <div class="w-full max-w-sm space-y-3">

                        <!-- Already selected: show chip -->
                        <div v-if="cart.customer" class="animate-scale-in rounded-2xl border-2 border-green-300 bg-green-50 p-4">
                            <div class="flex items-center gap-3">
                                <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-600 text-xl font-bold text-white">
                                    {{ cart.customer.name?.charAt(0).toUpperCase() }}
                                </div>
                                <div class="min-w-0 flex-1">
                                    <div class="text-base font-bold text-slate-900">{{ cart.customer.name }}</div>
                                    <div class="text-sm text-green-700">{{ cart.customer.phone }}</div>
                                </div>
                                <button
                                    class="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-red-100 hover:text-red-500"
                                    @click="cart.setCustomer(null); customerLoyalty = null; selectedReward = null;"
                                >✕</button>
                            </div>
                            <div class="mt-3 text-center text-xs text-green-600 font-medium">✓ Customer selected — tap Continue below</div>
                        </div>

                        <!-- Search input -->
                        <template v-else>
                            <div class="relative">
                                <svg class="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                                </svg>
                                <input
                                    v-model="customerQuery"
                                    placeholder="Search by name or phone…"
                                    class="w-full rounded-2xl border-2 border-slate-200 py-4 pr-4 pl-12 text-base transition-all focus:border-blue-400 focus:ring-4 focus:ring-blue-100 focus:outline-none"
                                />
                                <div v-if="searchingCustomer" class="absolute top-1/2 right-4 -translate-y-1/2">
                                    <svg class="h-4 w-4 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
                                        <circle cx="12" cy="12" r="10" stroke="rgba(59,130,246,0.3)" stroke-width="3" />
                                        <path d="M12 2a10 10 0 0110 10" stroke="#3b82f6" stroke-width="3" stroke-linecap="round" />
                                    </svg>
                                </div>
                            </div>

                            <!-- Search results -->
                            <Transition name="dropdown">
                                <div v-if="customerResults.length" class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md">
                                    <button
                                        v-for="c in customerResults"
                                        :key="c.id"
                                        class="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-4 text-left transition-colors last:border-0 hover:bg-blue-50 active:bg-blue-100"
                                        @click="selectCustomer(c)"
                                    >
                                        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
                                            {{ c.name?.charAt(0).toUpperCase() }}
                                        </div>
                                        <div class="min-w-0 flex-1">
                                            <div class="font-semibold text-slate-800">{{ c.name }}</div>
                                            <div class="text-sm text-slate-400">{{ c.phone }}</div>
                                        </div>
                                        <svg class="h-4 w-4 shrink-0 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                                        </svg>
                                    </button>
                                </div>
                            </Transition>

                            <!-- No results: prompt to create -->
                            <Transition name="dropdown">
                                <button
                                    v-if="customerQuery.trim() && !searchingCustomer && !customerResults.length"
                                    class="flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50 px-4 py-3.5 text-left transition-all hover:border-blue-400 hover:bg-blue-100 active:scale-[0.98]"
                                    @click="createWithQuery"
                                >
                                    <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">+</div>
                                    <div class="min-w-0 flex-1">
                                        <div class="text-sm font-semibold text-blue-700">Create "{{ customerQuery.trim() }}"</div>
                                        <div class="text-xs text-blue-500">No customer found — tap to create new</div>
                                    </div>
                                </button>
                            </Transition>

                            <!-- New customer (manual) -->
                            <button
                                v-if="!customerQuery.trim() || customerResults.length"
                                class="w-full rounded-2xl border-2 border-dashed border-slate-200 py-3.5 text-sm font-semibold text-slate-500 transition-all hover:border-blue-300 hover:text-blue-600 active:scale-[0.98]"
                                @click="showNewCustomerForm = true"
                            >+ New Customer</button>
                        </template>
                    </div>
                </div>
            </div>

            <!-- ══ STEP 2: Services ══ -->
            <div v-else-if="currentStep === 2" key="step2" class="flex flex-1 flex-col overflow-hidden">

                <!-- Context strip: customer + running total -->
                <div class="shrink-0 flex items-center justify-between border-b border-slate-100 bg-white px-4 py-2.5">
                    <div class="flex items-center gap-2">
                        <div v-if="cart.customer" class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                            {{ cart.customer.name?.charAt(0).toUpperCase() }}
                        </div>
                        <div v-else class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-300 text-xs font-bold text-white">?</div>
                        <span class="text-sm font-semibold text-slate-700">{{ cart.customer?.name ?? 'Walk-in' }}</span>
                    </div>
                    <div v-if="cart.items.length" class="flex items-center gap-1.5">
                        <span class="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">
                            {{ cart.items.length }} service{{ cart.items.length !== 1 ? 's' : '' }}
                        </span>
                        <span class="text-sm font-bold text-slate-800">₱{{ fmt(cart.total) }}</span>
                    </div>
                    <span v-else class="text-xs text-slate-400">Tap services to add</span>
                </div>

                <!-- Category tabs -->
                <div class="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-slate-200 bg-white px-4 py-3" style="scrollbar-width: none">
                    <button class="cat-tab" :class="activeCategory === null ? 'cat-tab-active' : 'cat-tab-inactive'" @click="activeCategory = null">All</button>
                    <button
                        v-for="cat in categories"
                        :key="cat.id"
                        class="cat-tab"
                        :class="activeCategory === cat.id ? 'cat-tab-active' : 'cat-tab-inactive'"
                        @click="activeCategory = cat.id"
                    >{{ categoryEmoji(cat) }} {{ cat.name }}</button>
                </div>

                <!-- Service grid -->
                <div class="min-h-0 flex-1 overflow-y-auto p-4">
                    <div v-if="loadingServices" class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                        <div v-for="n in 8" :key="n" class="skeleton h-28 rounded-2xl" />
                    </div>

                    <div v-else-if="!filteredServices.length" class="flex h-48 flex-col items-center justify-center gap-2 text-slate-400">
                        <span class="text-4xl">🧺</span>
                        <span class="text-sm">No services in this category</span>
                    </div>

                    <div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                        <div
                            v-for="(svc, i) in filteredServices"
                            :key="svc.id"
                            class="service-card animate-scale-in"
                            :class="inCart(svc.id) ? 'service-card-active' : ''"
                            :style="`animation-delay: ${i * 20}ms`"
                            @click="!inCart(svc.id) && cart.addItem(svc)"
                        >
                            <div class="flex w-full items-start justify-between">
                                <div class="service-card-emoji">{{ serviceEmoji(svc) }}</div>
                                <div class="text-xl font-bold" style="color: #2563eb">{{ formatPrice(svc) }}</div>
                            </div>
                            <div class="w-full line-clamp-2 text-sm font-semibold leading-tight text-slate-800">{{ svc.name }}</div>

                            <div v-if="svc.is_loyalty_eligible" class="absolute top-1.5 left-1.5 text-[10px] leading-none" title="Earns loyalty stamps">🎫</div>

                            <!-- Qty + remove controls (when in cart) -->
                            <div v-if="inCart(svc.id)" class="mt-1 flex w-full items-center gap-1">
                                <div class="flex flex-1 items-center justify-between rounded-xl px-1 py-1" style="background: #2563eb">
                                    <button
                                        class="flex h-8 w-8 items-center justify-center rounded-lg text-base font-bold text-white transition-all active:scale-90"
                                        style="background: rgba(255,255,255,0.18)"
                                        @click.stop="cart.updateQuantity(svc.id, cartQty(svc) - (svc.pricing_type === 'per_kilo' ? 0.5 : 1))"
                                    >−</button>
                                    <span class="min-w-[24px] text-center text-sm font-bold text-white">{{ cartQty(svc) }}</span>
                                    <button
                                        class="flex h-8 w-8 items-center justify-center rounded-lg text-base font-bold text-white transition-all active:scale-90"
                                        style="background: rgba(255,255,255,0.18)"
                                        @click.stop="cart.updateQuantity(svc.id, cartQty(svc) + (svc.pricing_type === 'per_kilo' ? 0.5 : 1))"
                                    >+</button>
                                </div>
                                <button
                                    class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-red-100 text-xs text-red-500 transition-all active:scale-90 hover:bg-red-200"
                                    @click.stop="cart.removeItem(svc.id)"
                                >✕</button>
                            </div>

                            <div v-else class="service-card-ripple" />
                        </div>
                    </div>
                </div>
            </div>

            <!-- ══ STEP 3: Review & Pay ══ -->
            <div v-else key="step3" class="flex flex-1 flex-col overflow-y-auto p-4 sm:p-6">
                <div class="mx-auto w-full max-w-lg space-y-4">

                    <!-- Customer -->
                    <div class="rounded-2xl border border-slate-200 bg-white p-4">
                        <div class="mb-2 flex items-center justify-between">
                            <span class="text-xs font-semibold uppercase tracking-wide text-slate-400">Customer</span>
                            <button class="text-xs font-medium text-blue-600 hover:text-blue-700" @click="currentStep = 1">Change</button>
                        </div>
                        <div v-if="cart.customer" class="flex items-center gap-3">
                            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                                {{ cart.customer.name?.charAt(0).toUpperCase() }}
                            </div>
                            <div>
                                <div class="font-semibold text-slate-900">{{ cart.customer.name }}</div>
                                <div class="text-sm text-slate-500">{{ cart.customer.phone }}</div>
                            </div>
                        </div>
                        <div v-else class="flex items-center gap-3 text-slate-500">
                            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg">🚶</div>
                            <div>
                                <div class="font-semibold">Walk-in Customer</div>
                                <div class="text-sm text-slate-400">No account</div>
                            </div>
                        </div>

                        <!-- Loyalty stamps -->
                        <div v-if="customerLoyalty" class="mt-3 space-y-1.5 rounded-xl bg-slate-50 p-3">
                            <div v-for="rule in customerLoyalty.rules" :key="rule.id" class="space-y-1">
                                <div class="flex items-center justify-between">
                                    <span class="text-xs text-slate-500">{{ rule.reward_description }}</span>
                                    <span class="text-xs font-semibold text-slate-700">{{ customerLoyalty.total_stamps % rule.every_n_stamps }}/{{ rule.every_n_stamps }}</span>
                                </div>
                                <div class="h-1.5 overflow-hidden rounded-full bg-slate-200">
                                    <div class="h-full rounded-full transition-all duration-500" style="background: linear-gradient(90deg,#3b82f6,#6366f1)" :style="`width:${((customerLoyalty.total_stamps % rule.every_n_stamps) / rule.every_n_stamps) * 100}%`" />
                                </div>
                            </div>
                            <div v-if="cart.loyaltyDiscount > 0" class="flex items-center justify-between pt-1">
                                <span class="flex items-center gap-1 text-xs font-medium text-green-700">
                                    🎁 {{ cart.appliedLoyaltyReward?.count > 1 ? `${cart.appliedLoyaltyReward.count}× free loads` : 'Free load' }} applied
                                </span>
                                <span class="text-xs font-bold text-green-700">−₱{{ fmt(cart.loyaltyDiscount) }}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Services -->
                    <div class="rounded-2xl border border-slate-200 bg-white p-4">
                        <div class="mb-3 flex items-center justify-between">
                            <span class="text-xs font-semibold uppercase tracking-wide text-slate-400">Services ({{ cart.items.length }})</span>
                            <button class="text-xs font-medium text-blue-600 hover:text-blue-700" @click="currentStep = 2">Edit</button>
                        </div>
                        <div class="divide-y divide-slate-100">
                            <div v-for="item in cart.items" :key="item.service_id" class="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                                <div class="min-w-0 flex-1">
                                    <div class="text-sm font-semibold text-slate-800">{{ item.service_name }}</div>
                                    <div class="text-xs text-slate-400">₱{{ fmt(item.unit_price) }} each</div>
                                </div>
                                <div class="flex items-center gap-2">
                                    <span class="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">×{{ item.quantity }}</span>
                                    <span class="w-16 text-right text-sm font-bold text-slate-900">₱{{ fmt(item.unit_price * item.quantity) }}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Fees & Notes -->
                    <div class="rounded-2xl border border-slate-200 bg-white p-4">
                        <div class="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Fees &amp; Notes</div>
                        <div v-if="settings.pickupDeliveryEnabled" class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="mb-1 block text-xs text-slate-500">Pickup fee</label>
                                <input v-model="cart.pickupFee" type="number" min="0" step="1" placeholder="0"
                                    class="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-right text-sm transition-all focus:border-blue-400 focus:outline-none" />
                            </div>
                            <div>
                                <label class="mb-1 block text-xs text-slate-500">Delivery fee</label>
                                <input v-model="cart.deliveryFee" type="number" min="0" step="1" placeholder="0"
                                    class="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-right text-sm transition-all focus:border-blue-400 focus:outline-none" />
                            </div>
                        </div>
                        <textarea v-model="cart.notes" placeholder="Order notes…" rows="2"
                            class="mt-3 w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm transition-all focus:border-blue-400 focus:outline-none" />
                        <div class="mt-2 flex flex-wrap gap-1.5">
                            <button
                                v-for="tag in ['No spray', 'Med temp only', 'Has eco bag', 'Has basket', 'Delicate', 'No fabric softener', 'Separate colors']"
                                :key="tag"
                                type="button"
                                class="rounded-full border px-2.5 py-1 text-xs font-medium transition-all active:scale-95"
                                :class="cart.notes?.includes(tag) ? 'bg-blue-100 border-blue-300 text-blue-700' : 'bg-white border-slate-200 text-slate-500 hover:border-blue-300 hover:text-blue-600'"
                                @click="cart.notes = cart.notes?.includes(tag)
                                    ? cart.notes.replace(tag,'').replace(/^[,\s]+|[,\s]+$/g,'').replace(/,\s*,/g,',').trim()
                                    : cart.notes ? cart.notes + ', ' + tag : tag"
                            >{{ tag }}</button>
                        </div>
                    </div>

                    <!-- Order total -->
                    <div class="rounded-2xl border border-slate-200 bg-white p-4">
                        <div class="space-y-1.5">
                            <div class="flex justify-between text-sm text-slate-500">
                                <span>Subtotal</span><span>₱{{ fmt(cart.subtotal) }}</span>
                            </div>
                            <div v-if="Number(cart.pickupFee) + Number(cart.deliveryFee) > 0" class="flex justify-between text-sm text-slate-500">
                                <span>Fees</span><span>₱{{ fmt(Number(cart.pickupFee) + Number(cart.deliveryFee)) }}</span>
                            </div>
                            <div v-if="cart.loyaltyDiscount > 0" class="flex justify-between text-sm font-medium text-green-600">
                                <span>Loyalty discount</span><span>−₱{{ fmt(cart.loyaltyDiscount) }}</span>
                            </div>
                        </div>
                        <div class="mt-3 flex justify-between border-t border-slate-100 pt-3 text-lg font-bold text-slate-900">
                            <span>Total</span><span>₱{{ fmt(cart.total) }}</span>
                        </div>
                    </div>

                </div>
            </div>
            </Transition>

        </div>

        <!-- ───── Bottom Navigation ───── -->
        <div class="shrink-0 border-t border-slate-200 bg-white px-4 py-3">

            <!-- Step 1 nav -->
            <div v-if="currentStep === 1">
                <button
                    class="w-full rounded-2xl py-4 text-sm font-bold text-white transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                    style="background:linear-gradient(135deg,#2563eb,#4f46e5);box-shadow:0 4px 14px rgba(37,99,235,0.3)"
                    :disabled="!cart.customer"
                    @click="currentStep = 2"
                >
                    Continue to Services →
                </button>
            </div>

            <!-- Step 2 nav -->
            <div v-else-if="currentStep === 2" class="flex gap-3">
                <button
                    class="rounded-2xl border-2 border-slate-200 px-5 py-4 text-sm font-semibold text-slate-600 transition-all hover:bg-slate-50 active:scale-[0.98]"
                    @click="currentStep = 1"
                >← Back</button>
                <button
                    class="flex-1 rounded-2xl py-4 text-sm font-bold text-white transition-all active:scale-[0.98] disabled:opacity-40"
                    :disabled="!cart.items.length"
                    style="background: linear-gradient(135deg,#2563eb,#4f46e5); box-shadow: 0 4px 14px rgba(37,99,235,0.3);"
                    :style="!cart.items.length ? 'box-shadow:none' : ''"
                    @click="currentStep = 3"
                >
                    <span v-if="cart.items.length">Review Order ({{ cart.items.length }} service{{ cart.items.length !== 1 ? 's' : '' }}) →</span>
                    <span v-else>Select at least one service</span>
                </button>
            </div>

            <!-- Step 3 nav -->
            <div v-else class="flex gap-3">
                <button
                    class="rounded-2xl border-2 border-slate-200 px-5 py-4 text-sm font-semibold text-slate-600 transition-all hover:bg-slate-50 active:scale-[0.98]"
                    @click="currentStep = 2"
                >← Back</button>
                <button
                    class="flex-1 rounded-2xl py-4 text-sm font-bold text-white transition-all active:scale-[0.98]"
                    style="background: linear-gradient(135deg,#16a34a,#15803d); box-shadow: 0 4px 14px rgba(22,163,74,0.35);"
                    @click="openPayment"
                >Place Order · ₱{{ fmt(cart.total) }} →</button>
            </div>

        </div>

        <!-- ───── Payment Modal ───── -->
        <Teleport to="body">
            <Transition name="modal-backdrop">
                <div
                    v-if="showPayment"
                    class="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
                    style="background: rgba(15,23,42,0.6); backdrop-filter: blur(6px);"
                >
                    <Transition name="modal">
                        <div class="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl" style="box-shadow:0 32px 80px rgba(0,0,0,0.3)">
                            <div class="border-b border-slate-100 px-6 pt-6 pb-4">
                                <div class="flex items-center justify-between">
                                    <div>
                                        <h2 class="text-lg font-bold text-slate-900">Payment</h2>
                                        <p class="mt-0.5 text-sm text-slate-400">Total: <span class="font-bold text-slate-800">₱{{ fmt(cart.total) }}</span></p>
                                    </div>
                                    <button class="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200" @click="showPayment = false">✕</button>
                                </div>
                            </div>

                            <div class="max-h-[70vh] space-y-3 overflow-y-auto px-6 py-4">
                                <!-- Customer summary in modal -->
                                <div class="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                    <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" :style="cart.customer ? `background:hsl(${(cart.customer.name?.charCodeAt(0)*7)%360},65%,55%)` : 'background:#94a3b8'">
                                        {{ cart.customer?.name?.charAt(0).toUpperCase() ?? '?' }}
                                    </div>
                                    <div class="min-w-0 flex-1">
                                        <div class="text-sm font-semibold text-slate-800">{{ cart.customer?.name ?? 'Walk-in Customer' }}</div>
                                        <div class="text-xs text-slate-400">{{ cart.customer?.phone ?? 'No account' }}</div>
                                    </div>
                                </div>

                                <!-- Payment rows -->
                                <div v-for="(p, i) in payments" :key="i" class="animate-scale-in space-y-3">
                                    <div class="flex items-center gap-2">
                                        <div class="flex flex-1 gap-1">
                                            <button
                                                v-for="m in ['cash', 'gcash']"
                                                :key="m"
                                                class="flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all"
                                                :class="p.method === m ? 'bg-blue-600 text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-500 hover:border-slate-300'"
                                                @click="p.method = m"
                                            >{{ m.toUpperCase() }}</button>
                                        </div>
                                        <button v-if="payments.length > 1" class="flex h-7 w-7 items-center justify-center rounded-full bg-red-100 text-xs text-red-500 transition-colors hover:bg-red-200" @click="payments.splice(i, 1)">✕</button>
                                    </div>

                                    <div class="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                                        <span class="text-xs text-slate-500">Amount</span>
                                        <span class="text-base font-bold text-slate-900">₱{{ fmt(p.amount) }}</span>
                                    </div>

                                    <template v-if="p.method === 'cash'">
                                        <div class="grid grid-cols-3 gap-2">
                                            <button
                                                class="rounded-xl py-2.5 text-sm font-bold transition-all active:scale-95"
                                                :class="p.tendered === p.amount && p.tendered !== '' ? 'bg-blue-600 text-white shadow-sm' : 'border-2 border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'"
                                                @click="p.tendered = p.amount; p.showCustom = false"
                                            >Exact</button>
                                            <button
                                                v-for="b in quickAmounts()"
                                                :key="b"
                                                class="rounded-xl py-2.5 text-sm font-bold transition-all active:scale-95"
                                                :class="Number(p.tendered) === b ? 'bg-slate-800 text-white shadow-sm' : 'border-2 border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'"
                                                @click="p.tendered = String(b); p.showCustom = false"
                                            >₱{{ b.toLocaleString() }}</button>
                                            <button
                                                class="rounded-xl py-2.5 text-sm font-bold transition-all active:scale-95"
                                                :class="p.showCustom ? 'bg-slate-700 text-white shadow-sm' : 'border-2 border-slate-200 bg-white text-slate-500 hover:border-slate-300'"
                                                @click="p.showCustom = !p.showCustom; if (p.showCustom) p.tendered = ''"
                                            >Custom</button>
                                        </div>

                                        <div v-if="p.showCustom" class="relative">
                                            <span class="absolute top-1/2 left-3 -translate-y-1/2 text-sm text-slate-400">₱</span>
                                            <input v-model="p.tendered" type="number" step="1" min="0" placeholder="Enter amount given…" autofocus
                                                class="w-full rounded-xl border-2 border-slate-300 py-2.5 pr-3 pl-7 text-right text-sm font-semibold transition-all focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none" />
                                        </div>

                                        <Transition name="scale-in">
                                            <div v-if="Number(p.tendered) >= Number(p.amount) && Number(p.amount) > 0"
                                                class="flex items-center justify-between rounded-xl px-3 py-2.5"
                                                style="background:linear-gradient(135deg,#dcfce7,#bbf7d0)">
                                                <span class="text-sm font-medium text-green-700">Change</span>
                                                <span class="text-xl font-bold text-green-700">₱{{ fmt(Number(p.tendered) - Number(p.amount)) }}</span>
                                            </div>
                                        </Transition>
                                    </template>

                                    <div v-else class="flex items-center gap-2">
                                        <span class="w-16 shrink-0 text-xs text-slate-500">Ref # <span class="text-slate-400">(opt)</span></span>
                                        <input v-model="p.reference_number" placeholder="Transaction reference (optional)"
                                            class="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm transition-all focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none" />
                                    </div>
                                </div>

                                <button v-if="remainingAfterPayments > 0.01"
                                    class="w-full rounded-2xl border-2 border-dashed border-blue-200 py-2.5 text-sm font-medium text-blue-600 transition-all hover:border-blue-300 hover:bg-blue-50 active:scale-[0.98]"
                                    @click="addPaymentRow"
                                >+ Split payment (₱{{ fmt(remainingAfterPayments) }} remaining)</button>

                                <Transition name="shake">
                                    <div v-if="paymentError" class="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-600">
                                        <svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                                        </svg>
                                        {{ paymentError }}
                                    </div>
                                </Transition>
                            </div>

                            <div class="space-y-2 border-t border-slate-100 px-6 py-4">
                                <div class="flex gap-3">
                                    <button class="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-semibold text-slate-600 transition-all hover:bg-slate-50 active:scale-[0.98]" @click="showPayment = false">Cancel</button>
                                    <button
                                        class="flex-1 rounded-2xl py-3 text-sm font-bold text-white transition-all active:scale-[0.98] disabled:opacity-50"
                                        :disabled="processingPayment"
                                        style="background:linear-gradient(135deg,#16a34a,#15803d);box-shadow:0 4px 14px rgba(22,163,74,0.35);"
                                        @click="processPayment"
                                    >
                                        <span v-if="!processingPayment">✓ {{ confirmLabel }}</span>
                                        <span v-else class="flex items-center justify-center gap-2">
                                            <svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                                <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" stroke-width="3" />
                                                <path d="M12 2a10 10 0 0110 10" stroke="white" stroke-width="3" stroke-linecap="round" />
                                            </svg>
                                            Processing…
                                        </span>
                                    </button>
                                </div>
                                <div class="rounded-xl px-3 py-2 text-center text-xs font-medium transition-all"
                                    :class="effectiveTendered < 0.01
                                        ? 'border border-amber-200 bg-amber-50 text-amber-700'
                                        : effectiveTendered < cart.total - 0.01
                                            ? 'border border-blue-200 bg-blue-50 text-blue-700'
                                            : 'border border-slate-200 bg-slate-50 text-slate-400'"
                                >
                                    <span v-if="effectiveTendered < 0.01">On Pay Later</span>
                                    <span v-else-if="effectiveTendered < cart.total - 0.01">Down payment of ₱{{ fmt(effectiveTendered) }} — balance ₱{{ fmt(cart.total - effectiveTendered) }} due on pickup</span>
                                    <span v-else>Full payment ✓</span>
                                </div>
                            </div>
                        </div>
                    </Transition>
                </div>
            </Transition>
        </Teleport>

        <!-- ───── New Customer Modal ───── -->
        <Dialog
            v-model:visible="showNewCustomerForm"
            modal
            header="New Customer"
            :style="{ width: '400px', maxWidth: '95vw' }"
            :draggable="false"
            @hide="newCustomer.name = ''; newCustomer.phone = ''; newCustomer.address = ''; nameError = ''; phoneError = ''"
        >
            <div class="space-y-3 pt-1">
                <div>
                    <input
                        v-model="newCustomer.name"
                        @input="capitalizeField('name'); nameError = ''"
                        placeholder="Full name *"
                        class="w-full rounded-xl border px-3 py-3 text-sm transition-all focus:border-blue-400 focus:outline-none"
                        :class="nameError ? 'border-red-300' : 'border-slate-200'"
                    />
                    <p v-if="nameError" class="mt-1 px-0.5 text-xs text-red-500">{{ nameError }}</p>
                </div>
                <div>
                    <input
                        :value="displayPhone"
                        @input="onPhoneInput"
                        placeholder="Phone number * (11 digits)"
                        maxlength="13"
                        class="w-full rounded-xl border px-3 py-3 text-sm transition-all focus:border-blue-400 focus:outline-none"
                        :class="phoneError ? 'border-red-300' : 'border-slate-200'"
                    />
                    <p v-if="phoneError" class="mt-1 px-0.5 text-xs text-red-500">{{ phoneError }}</p>
                </div>
                <input
                    v-model="newCustomer.address"
                    @input="capitalizeField('address')"
                    placeholder="Address (optional)"
                    class="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm transition-all focus:border-blue-400 focus:outline-none"
                />
                <div class="flex gap-2 pt-1">
                    <button
                        class="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-all"
                        @click="showNewCustomerForm = false"
                    >Cancel</button>
                    <button
                        class="flex-1 rounded-xl py-3 text-sm font-bold text-white transition-all disabled:opacity-50"
                        style="background: linear-gradient(135deg, #2563eb, #4f46e5);"
                        :disabled="savingCustomer || !newCustomer.name || !newCustomer.phone"
                        @click="saveNewCustomer"
                    >{{ savingCustomer ? 'Saving…' : 'Save & Select' }}</button>
                </div>
            </div>
        </Dialog>

        <!-- ───── Receipt Modal ───── -->
        <ReceiptModal :order-id="receiptOrderId" @close="receiptOrderId = null" />

        <!-- ───── Success Modal ───── -->
        <Teleport to="body">
            <Transition name="modal-backdrop">
                <div
                    v-if="showSuccess"
                    class="fixed inset-0 z-50 flex items-center justify-center p-4"
                    style="background:rgba(15,23,42,0.6);backdrop-filter:blur(6px);"
                    @click.self="showSuccess = false"
                >
                    <Transition name="modal">
                        <div class="w-full max-w-sm rounded-3xl bg-white p-8 text-center" style="box-shadow:0 32px 80px rgba(0,0,0,0.3)">
                            <div class="success-icon-wrapper">
                                <div class="success-ring" />
                                <div class="success-icon animate-bounce-in">✓</div>
                            </div>
                            <h2 class="mt-4 mb-1 text-xl font-bold text-slate-900">Order Placed!</h2>
                            <p class="font-mono text-sm text-slate-400">{{ lastOrder?.order_number }}</p>
                            <div v-if="lastOrder?.customer" class="mt-2 text-sm text-slate-500">
                                {{ lastOrder.customer?.name || cart.customer?.name }}
                            </div>
                            <div v-if="lastRedeemedReward" class="mt-3 flex items-center justify-center gap-1.5 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-xs font-medium text-green-700">
                                🎁 {{ lastRedeemedReward.count > 1 ? `${lastRedeemedReward.count} free loads redeemed` : '1 free load redeemed' }}
                            </div>

                            <div class="mt-5 flex gap-2">
                                <button class="flex-1 rounded-2xl py-3 text-sm font-bold text-white transition-all active:scale-[0.98]"
                                    style="background:linear-gradient(135deg,#1d4ed8,#4f46e5);box-shadow:0 4px 14px rgba(99,102,241,0.3);"
                                    @click="receiptOrderId = lastOrder?.id">🖨 Receipt</button>
                                <button class="flex-1 rounded-2xl py-3 text-sm font-bold text-white transition-all active:scale-[0.98] disabled:opacity-50"
                                    style="background:linear-gradient(135deg,#0f766e,#0d9488);box-shadow:0 4px 14px rgba(13,148,136,0.3);"
                                    :disabled="printingSlips"
                                    @click="printOrderSlips(lastOrder)">
                                    <span v-if="printingSlips">Printing…</span>
                                    <span v-else>🏷 Print Slips</span>
                                </button>
                            </div>
                            <div class="mt-2 flex gap-2">
                                <button class="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-semibold text-slate-600 transition-all hover:bg-slate-50 active:scale-[0.98]"
                                    @click="() => { showSuccess = false; router.push('/orders/' + lastOrder?.id); }">View Order</button>
                                <button class="flex-1 rounded-2xl py-3 text-sm font-bold text-white transition-all active:scale-[0.98]"
                                    style="background:linear-gradient(135deg,#3b82f6,#6366f1);box-shadow:0 4px 14px rgba(99,102,241,0.35);"
                                    @click="showSuccess = false; currentStep = 1;">New Order</button>
                            </div>
                        </div>
                    </Transition>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>

<style scoped>
/* Step indicator circles */
.step-circle {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 700;
    transition: all 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
.step-active {
    background: #2563eb;
    color: white;
    box-shadow: 0 0 0 5px rgba(37, 99, 235, 0.15);
}
.step-done {
    background: #16a34a;
    color: white;
}
.step-future {
    background: white;
    color: #94a3b8;
    border: 2px solid #e2e8f0;
}

/* Category tabs */
.cat-tab {
    padding: 6px 14px;
    border-radius: 9999px;
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    transition: all 150ms ease;
    border: none;
    cursor: pointer;
}
.cat-tab-active { background: #2563eb; color: white; box-shadow: 0 2px 8px rgba(37,99,235,0.3); }
.cat-tab-inactive { background: transparent; color: #64748b; }
.cat-tab-inactive:hover { background: #f1f5f9; color: #334155; }
.cat-tab:active { transform: scale(0.95); }

/* Service cards */
.service-card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    padding: 14px;
    background: white;
    border-radius: 18px;
    border: 2px solid #e2e8f0;
    cursor: pointer;
    transition: all 180ms cubic-bezier(0.22, 1, 0.36, 1);
    overflow: hidden;
    text-align: left;
}
.service-card:hover { border-color: #93c5fd; background: #f0f9ff; transform: translateY(-2px); box-shadow: 0 8px 24px rgba(37,99,235,0.12); }
.service-card:active { transform: scale(0.96); }
.service-card-active { border-color: #2563eb !important; background: #eff6ff !important; cursor: default; }
.service-card-active:hover { border-color: #2563eb !important; background: #eff6ff !important; transform: none; box-shadow: none; }
.service-card-emoji { font-size: 28px; line-height: 1; transition: transform 200ms ease; }
.service-card:not(.service-card-active):hover .service-card-emoji { transform: scale(1.15) rotate(-5deg); }
.service-card-ripple {
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at center, rgba(37,99,235,0.08) 0%, transparent 70%);
    opacity: 0;
    transition: opacity 150ms ease;
}
.service-card:active .service-card-ripple { opacity: 1; }

/* Success icon */
.success-icon-wrapper { position: relative; width: 72px; height: 72px; margin: 0 auto; }
.success-ring { position: absolute; inset: 0; border-radius: 50%; border: 2px solid #16a34a; animation: pulse-ring 1.5s ease-out infinite; }
.success-icon { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 32px; font-weight: bold; color: #16a34a; background: #dcfce7; border-radius: 50%; }
@keyframes pulse-ring { 0% { transform: scale(1); opacity: 0.8; } 100% { transform: scale(1.6); opacity: 0; } }

/* Transitions */
.step-fade-enter-active { animation: step-slide-in 280ms cubic-bezier(0.22, 1, 0.36, 1) both; }
.step-fade-leave-active { animation: step-slide-out 200ms ease both; }
@keyframes step-slide-in { from { opacity: 0; transform: translateX(18px); } to { opacity: 1; transform: none; } }
@keyframes step-slide-out { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateX(-12px); } }

.modal-backdrop-enter-active { animation: fade-in 200ms ease both; }
.modal-backdrop-leave-active { animation: fade-in 150ms ease reverse both; }
.modal-enter-active { animation: scale-in 220ms cubic-bezier(0.34, 1.56, 0.64, 1) both; }
.modal-leave-active { animation: scale-in 150ms ease reverse both; }
.dropdown-enter-active { animation: slide-down 180ms cubic-bezier(0.22, 1, 0.36, 1) both; }
.dropdown-leave-active { animation: slide-down 120ms ease reverse both; }
.scale-in-enter-active { animation: scale-in 220ms cubic-bezier(0.34, 1.56, 0.64, 1) both; }
.scale-in-leave-active { animation: scale-in 150ms ease reverse both; }
.shake-enter-active { animation: shake 350ms ease; }

@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes slide-down { from { opacity: 0; transform: translateY(-8px) scale(0.96); } to { opacity: 1; transform: none; } }
@keyframes scale-in { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: none; } }
@keyframes bounce-in { 0% { opacity: 0; transform: scale(0.3); } 50% { transform: scale(1.08); } 100% { opacity: 1; transform: none; } }
@keyframes shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-6px); } 40% { transform: translateX(6px); } 60% { transform: translateX(-4px); } 80% { transform: translateX(4px); } }
@keyframes spin { to { transform: rotate(360deg); } }
.animate-spin { animation: spin 800ms linear infinite; }
.animate-bounce-in { animation: bounce-in 400ms cubic-bezier(0.34, 1.56, 0.64, 1) both; }
.animate-scale-in { animation: scale-in 250ms cubic-bezier(0.34, 1.56, 0.64, 1) both; }

.slide-down-enter-active, .slide-down-leave-active { transition: all 220ms ease; overflow: hidden; }
.slide-down-enter-from, .slide-down-leave-to { opacity: 0; max-height: 0; padding-top: 0; padding-bottom: 0; }
.slide-down-enter-to, .slide-down-leave-from { opacity: 1; max-height: 400px; }
</style>
