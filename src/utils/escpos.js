// ESC/POS builder for 58mm thermal paper (32 chars/line at normal size)

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

const CMD = {
    INIT: [ESC, 0x40],
    BOLD_ON: [ESC, 0x45, 0x01],
    BOLD_OFF: [ESC, 0x45, 0x00],
    CENTER: [ESC, 0x61, 0x01],
    LEFT: [ESC, 0x61, 0x00],
    DOUBLE_SIZE: [GS, 0x21, 0x11],
    NORMAL_SIZE: [GS, 0x21, 0x00],
    FEED_3: [ESC, 0x64, 0x03],
    FEED_5: [ESC, 0x64, 0x05],
    CUT: [GS, 0x56, 0x01], // partial cut
};

const ENC = new TextEncoder();
const WIDTH = 32;

function bytes(...parts) {
    const out = [];
    for (const p of parts) {
        if (Array.isArray(p)) out.push(...p);
        else if (typeof p === 'string') out.push(...ENC.encode(p));
        else if (p instanceof Uint8Array) out.push(...p);
        else out.push(p);
    }
    return new Uint8Array(out);
}

function line(text = '') {
    return bytes(text.slice(0, WIDTH) + '\n');
}

function divider() {
    return line('-'.repeat(WIDTH));
}

/** right-pad `left` and left-pad `right` so they fill WIDTH chars */
function twoCol(left, right) {
    const total = WIDTH;
    const l = String(left);
    const r = String(right);
    const pad = Math.max(1, total - l.length - r.length);
    return line(l + ' '.repeat(pad) + r);
}

/** Format peso amount */
function peso(n) {
    return `P${Number(n || 0).toFixed(2)}`;
}

// ─────────────────────────────────────────
export function buildReceiptBytes(order, settings = {}) {
    const parts = [];

    const push = (...cmds) => parts.push(...cmds);

    push(bytes(CMD.INIT));

    // ── Header ────────────────────────────────
    push(bytes(CMD.CENTER));
    if (settings.shop_name) {
        push(bytes(CMD.BOLD_ON, CMD.DOUBLE_SIZE));
        push(line(settings.shop_name.toUpperCase()));
        push(bytes(CMD.NORMAL_SIZE, CMD.BOLD_OFF));
    }
    if (settings.shop_address) push(line(settings.shop_address));
    if (settings.shop_phone) push(line(settings.shop_phone));
    if (settings.shop_tin) push(line('TIN: ' + settings.shop_tin));
    push(bytes(CMD.LEFT));
    push(divider());

    // ── Order info ────────────────────────────
    const orderNum = order.order_number || order.id || '';
    push(bytes(CMD.BOLD_ON));
    push(line('ORDER #: ' + orderNum));
    push(bytes(CMD.BOLD_OFF));

    const date = new Date(order.ordered_at || order.created_at || Date.now());
    push(
        line(
            'Date: ' +
                date.toLocaleDateString('en-PH', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                })
        )
    );
    push(
        line(
            'Time: ' +
                date.toLocaleTimeString('en-PH', {
                    hour: '2-digit',
                    minute: '2-digit',
                })
        )
    );

    // ── Customer ──────────────────────────────
    const cust = order.customer;
    if (cust?.name) {
        push(divider());
        push(bytes(CMD.BOLD_ON));
        push(line('CUSTOMER: ' + cust.name));
        push(bytes(CMD.BOLD_OFF));
        // if (cust.phone) push(line(String(cust.phone)))
    }

    push(divider());

    // ── Items (loads) ─────────────────────────
    push(bytes(CMD.BOLD_ON));
    push(line('ITEMS'));
    push(bytes(CMD.BOLD_OFF));

    const loads = order.loads || [];
    for (const load of loads) {
        const svcName =
            load.service_name_snapshot || load.service?.name || 'Service';
        const qty = Number(load.quantity || 1);
        const unitPrice = Number(
            load.unit_price_snapshot || load.service?.price || 0
        );
        const lineTotal = Number(load.line_total || unitPrice * qty);

        push(bytes(CMD.BOLD_ON));
        push(line(svcName));
        push(bytes(CMD.BOLD_OFF));
        push(twoCol('  ' + qty + ' x ' + peso(unitPrice), peso(lineTotal)));

        const addons = load.load_addons || load.addons || [];
        for (const a of addons) {
            const aqty = a.quantity || 1;
            const aname = a.addon_name_snapshot || a.product?.name || 'Add-on';
            const atotal = Number(a.line_total || a.total_price || 0);
            push(twoCol('  + ' + aname + ' x' + aqty, peso(atotal)));
        }
    }

    push(divider());

    // ── Totals ────────────────────────────────
    const subtotal = Number(order.subtotal || 0);
    const discount = Number(order.discount_amount || order.discount || 0);
    const pickupFee = Number(order.pickup_fee || 0);
    const delivFee = Number(order.delivery_fee || 0);
    const grandTotal = Number(order.total_amount || order.total_price || 0);

    push(twoCol('Subtotal:', peso(subtotal)));
    if (discount > 0) push(twoCol('Discount:', '-' + peso(discount)));
    if (pickupFee > 0) push(twoCol('Pickup Fee:', peso(pickupFee)));
    if (delivFee > 0) push(twoCol('Delivery Fee:', peso(delivFee)));

    push(bytes(CMD.BOLD_ON));
    push(twoCol('TOTAL:', peso(grandTotal)));
    push(bytes(CMD.BOLD_OFF));

    // ── Payments ──────────────────────────────
    const payments = order.payments || [];
    if (payments.length) {
        push(divider());
        push(bytes(CMD.BOLD_ON));
        push(line('PAYMENT'));
        push(bytes(CMD.BOLD_OFF));

        let totalCashTendered = 0;
        let totalCashAmount = 0;
        for (const p of payments) {
            if (p.type === 'refund') continue; // skip refunds
            const method = (
                p.method ||
                p.payment_method ||
                'Cash'
            ).toUpperCase();
            const amount = Number(p.amount || 0);
            push(twoCol(method + ':', peso(amount)));
            if (method === 'CASH') {
                totalCashAmount += amount;
                totalCashTendered += Number(p.tendered || amount);
            }
        }
        if (totalCashTendered > totalCashAmount) {
            push(twoCol('CHANGE:', peso(totalCashTendered - totalCashAmount)));
        }
    }

    // ── Balance due (pay later) ───────────────
    const paidAmount = Number(order.paid_amount || 0);
    const balanceDue = Math.max(0, grandTotal - paidAmount);
    if (balanceDue > 0.009) {
        push(divider());
        push(bytes(CMD.CENTER, CMD.BOLD_ON));
        push(line('*** BALANCE DUE ***'));
        push(bytes(CMD.DOUBLE_SIZE));
        push(line(peso(balanceDue)));
        push(bytes(CMD.NORMAL_SIZE));
        push(line('Please pay upon pickup.'));
        push(bytes(CMD.BOLD_OFF, CMD.LEFT));
    }

    // ── Loyalty ───────────────────────────────
    if (
        settings.receipt_show_loyalty === 'true' ||
        settings.receipt_show_loyalty === true
    ) {
        const pts = order.loyalty_points_earned || order.points_earned;
        if (pts) {
            push(divider());
            push(bytes(CMD.CENTER));
            push(line('Points Earned: ' + pts));
            push(bytes(CMD.LEFT));
        }
    }

    // ── Footer ────────────────────────────────
    if (settings.receipt_footer) {
        push(divider());
        push(bytes(CMD.CENTER));
        push(line(settings.receipt_footer));
        push(bytes(CMD.LEFT));
    }

    push(bytes(CMD.FEED_5, CMD.CUT));

    // Flatten all Uint8Arrays into one
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const p of parts) {
        out.set(p, offset);
        offset += p.length;
    }
    return out;
}
