import { router, json, error, requireAuth, db } from '@appdeploy/sdk';

type CustomerInput = { name?: string; phone?: string; note?: string };
type SaleInput = {
  customerId?: string;
  item?: string;
  quantity?: number;
  unitPrice?: number;
  date?: string;
  note?: string;
};
type PaymentInput = {
  customerId?: string;
  amount?: number;
  date?: string;
  note?: string;
};
type Customer = {
  name: string;
  phone: string;
  note: string;
  createdAt: string;
};
type Sale = {
  customerId: string;
  item: string;
  quantity: number;
  unitPrice: number;
  total: number;
  date: string;
  note: string;
  createdAt: string;
};
type Payment = {
  customerId: string;
  amount: number;
  date: string;
  note: string;
  createdAt: string;
};

const safePart = (userId: string) => userId.replace(/[^A-Za-z0-9_.-]/g, '_');
const tables = (userId: string) => {
  const key = safePart(userId);
  return {
    customers: 'customers_' + key,
    sales: 'sales_' + key,
    payments: 'payments_' + key,
  };
};
const now = () => new Date().toISOString();
const validDate = (value: unknown) =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value));
const text = (value: unknown, max = 180) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';
const positive = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

async function ledger(userId: string) {
  const t = tables(userId);
  const [customers, sales, payments] = await Promise.all([
    db.list<Customer>(t.customers, { limit: 200 }),
    db.list<Sale>(t.sales, { limit: 500 }),
    db.list<Payment>(t.payments, { limit: 500 }),
  ]);
  return {
    customers: customers.items,
    sales: sales.items,
    payments: payments.items,
  };
}
async function customerExists(userId: string, id: string) {
  const [customer] = await db.get<Customer>(tables(userId).customers, [id]);
  return customer !== null && customer !== undefined;
}

export const handler = router({
  'GET /api/_healthcheck': [async () => json({ message: 'Success' })],
  'GET /api/ledger': [
    requireAuth(),
    async ctx => {
      try {
        return json(await ledger(ctx.user!.userId));
      } catch (e) {
        console.error('ledger_read_failed', e);
        return error('Could not load ledger records.', 500);
      }
    },
  ],
  'POST /api/customers': [
    requireAuth(),
    async ctx => {
      const body = (ctx.body || {}) as CustomerInput;
      const name = text(body.name, 100);
      if (!name) return error('Customer name is required.', 400);
      const record: Customer = {
        name,
        phone: text(body.phone, 40),
        note: text(body.note, 500),
        createdAt: now(),
      };
      const [id] = await db.add(tables(ctx.user!.userId).customers, [
        record as unknown as Record<string, unknown>,
      ]);
      if (!id) return error('Could not create customer. Please retry.', 500);
      return json({ id, ...record }, 201);
    },
  ],
  'PUT /api/customers/:id': [
    requireAuth(),
    async ctx => {
      const body = (ctx.body || {}) as CustomerInput;
      const name = text(body.name, 100);
      if (!name) return error('Customer name is required.', 400);
      const t = tables(ctx.user!.userId);
      const [old] = await db.get<Customer>(t.customers, [ctx.params.id]);
      if (!old) return error('Customer not found.', 404);
      const [updated] = await db.tx.update(
        t.customers,
        [
          {
            id: ctx.params.id,
            record: {
              name,
              phone: text(body.phone, 40),
              note: text(body.note, 500),
              createdAt: old.createdAt,
            },
            if: { name: old.name },
          },
        ],
        { patch: false }
      );
      if (!updated) return error('Customer could not be updated.', 409);
      return json({
        id: ctx.params.id,
        name,
        phone: text(body.phone, 40),
        note: text(body.note, 500),
        createdAt: old.createdAt,
      });
    },
  ],
  'DELETE /api/customers/:id': [
    requireAuth(),
    async ctx => {
      const t = tables(ctx.user!.userId);
      const [sales, payments] = await Promise.all([
        db.list<Sale>(t.sales, { limit: 500 }),
        db.list<Payment>(t.payments, { limit: 500 }),
      ]);
      if (
        sales.items.some(s => s.customerId === ctx.params.id) ||
        payments.items.some(p => p.customerId === ctx.params.id)
      )
        return error(
          'Customers with sales or payments cannot be deleted.',
          409
        );
      const [deleted] = await db.delete(t.customers, [ctx.params.id]);
      return deleted
        ? json({ deleted: true })
        : error('Customer not found.', 404);
    },
  ],
  'POST /api/sales': [
    requireAuth(),
    async ctx => {
      const body = (ctx.body || {}) as SaleInput;
      const customerId = text(body.customerId, 100);
      const item = text(body.item, 160);
      const quantity = body.quantity;
      const unitPrice = body.unitPrice;
      if (
        !customerId ||
        !item ||
        !Number.isSafeInteger(quantity) ||
        !positive(quantity) ||
        !positive(unitPrice) ||
        !validDate(body.date)
      )
        return error(
          'Enter a customer, item, valid quantity, price and date.',
          400
        );
      if (!(await customerExists(ctx.user!.userId, customerId)))
        return error('Customer not found.', 404);
      const total =
        Math.round(Number(quantity) * Number(unitPrice) * 100) / 100;
      if (!Number.isFinite(total) || total <= 0 || total > 1e12)
        return error('Sale total is outside the allowed range.', 400);
      const record: Sale = {
        customerId,
        item,
        quantity: Number(quantity),
        unitPrice: Number(unitPrice),
        total,
        date: body.date!,
        note: text(body.note, 500),
        createdAt: now(),
      };
      const [id] = await db.add(tables(ctx.user!.userId).sales, [
        record as unknown as Record<string, unknown>,
      ]);
      if (!id) return error('Could not record sale.', 500);
      return json({ id, ...record }, 201);
    },
  ],
  'POST /api/payments': [
    requireAuth(),
    async ctx => {
      const body = (ctx.body || {}) as PaymentInput;
      const customerId = text(body.customerId, 100);
      const amount = body.amount;
      if (
        !customerId ||
        !positive(amount) ||
        Number(amount) > 1e12 ||
        !validDate(body.date)
      )
        return error('Enter a customer, valid amount and date.', 400);
      if (!(await customerExists(ctx.user!.userId, customerId)))
        return error('Customer not found.', 404);
      const t = tables(ctx.user!.userId);
      const current = await ledger(ctx.user!.userId);
      const salesTotal = current.sales
        .filter(s => s.customerId === customerId)
        .reduce((sum, s) => sum + Number(s.total), 0);
      const paidTotal = current.payments
        .filter(p => p.customerId === customerId)
        .reduce((sum, p) => sum + Number(p.amount), 0);
      if (Number(amount) > Math.max(0, salesTotal - paidTotal) + 0.000001)
        return error(
          'Payment is greater than this customer’s outstanding balance.',
          400
        );
      const record: Payment = {
        customerId,
        amount: Math.round(Number(amount) * 100) / 100,
        date: body.date!,
        note: text(body.note, 500),
        createdAt: now(),
      };
      const [id] = await db.add(t.payments, [
        record as unknown as Record<string, unknown>,
      ]);
      if (!id) return error('Could not record payment.', 500);
      return json({ id, ...record }, 201);
    },
  ],
});
