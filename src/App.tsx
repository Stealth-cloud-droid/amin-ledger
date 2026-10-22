import { useCallback, useEffect, useMemo, useState } from 'react';
import { auth, api } from '@appdeploy/client';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Bell,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Download,
  LogOut,
  Menu,
  MessageCircle,
  Plus,
  Search,
  ShoppingBag,
  Users,
  Wallet,
  X,
} from 'lucide-react';

type Customer = {
  id: string;
  name: string;
  phone: string;
  note?: string;
  createdAt?: string;
};
type Sale = {
  id: string;
  customerId: string;
  item: string;
  quantity: number;
  unitPrice: number;
  total: number;
  date: string;
  note?: string;
};
type Payment = {
  id: string;
  customerId: string;
  amount: number;
  date: string;
  note?: string;
};
type Ledger = { customers: Customer[]; sales: Sale[]; payments: Payment[] };
const money = (n: number) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(n || 0);
const today = () => new Date().toISOString().slice(0, 10);
const blankLedger: Ledger = { customers: [], sales: [], payments: [] };

function App() {
  const [user, setUser] = useState<{ name?: string; email?: string } | null>(
    null
  );
  const [ledger, setLedger] = useState<Ledger>(blankLedger);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [tab, setTab] = useState('Overview');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<'customer' | 'sale' | 'payment' | null>(
    null
  );
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [item, setItem] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [mobileMenu, setMobileMenu] = useState(false);

  const loadLedger = useCallback(async () => {
    const response = await api.get('/api/ledger');
    setLedger(response.data as Ledger);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const signedIn = await auth.getUser();
        if (!active) return;
        if (signedIn) {
          setUser(signedIn);
          await loadLedger();
        }
      } catch (e) {
        setErrorText(
          e instanceof Error ? e.message : 'Could not load your ledger.'
        );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [loadLedger]);

  const balances = useMemo(() => {
    const result: Record<string, number> = {};
    ledger.customers.forEach(c => {
      result[c.id] = 0;
    });
    ledger.sales.forEach(s => {
      result[s.customerId] = (result[s.customerId] || 0) + Number(s.total);
    });
    ledger.payments.forEach(p => {
      result[p.customerId] = (result[p.customerId] || 0) - Number(p.amount);
    });
    return result;
  }, [ledger]);
  const outstanding = Object.values(balances).reduce(
    (sum, value) => sum + Math.max(0, value),
    0
  );
  const salesTotal = ledger.sales.reduce((sum, s) => sum + Number(s.total), 0);
  const paidTotal = ledger.payments.reduce(
    (sum, p) => sum + Number(p.amount),
    0
  );
  const filteredCustomers = ledger.customers.filter(c =>
    (c.name + ' ' + c.phone).toLowerCase().includes(search.toLowerCase())
  );
  const recentSales = [...ledger.sales]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  async function signIn() {
    setErrorText('');
    try {
      const result = await auth.signIn();
      setUser(result.user);
      setLoading(true);
      await loadLedger();
    } catch (e) {
      const code = (e as { code?: string })?.code;
      setErrorText(
        code === 'popup_blocked'
          ? 'Allow pop-ups in your browser, then try again.'
          : code === 'popup_closed'
            ? 'Sign-in was cancelled. You can try again.'
            : 'Sign-in did not complete. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }
  async function signOut() {
    await auth.signOut();
    setUser(null);
    setLedger(blankLedger);
  }
  function openModal(
    kind: 'customer' | 'sale' | 'payment',
    customer?: Customer
  ) {
    setModal(kind);
    setEditingCustomer(customer || null);
    setCustomerName(customer?.name || '');
    setPhone(customer?.phone || '');
    setNote(customer?.note || '');
    setCustomerId(customer?.id || ledger.customers[0]?.id || '');
    setItem('');
    setQuantity('1');
    setUnitPrice('');
    setAmount('');
    setDate(today());
    setErrorText('');
  }
  async function submitModal(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrorText('');
    try {
      if (modal === 'customer') {
        if (!customerName.trim()) throw new Error('Enter the customer name.');
        const payload = {
          name: customerName.trim(),
          phone: phone.trim(),
          note: note.trim(),
        };
        if (editingCustomer)
          await api.put('/api/customers/' + editingCustomer.id, payload);
        else await api.post('/api/customers', payload);
      } else if (modal === 'sale') {
        if (
          !customerId ||
          !item.trim() ||
          Number(quantity) < 1 ||
          Number(unitPrice) <= 0
        )
          throw new Error(
            'Enter a customer, item, quantity and price greater than zero.'
          );
        await api.post('/api/sales', {
          customerId,
          item: item.trim(),
          quantity: Number(quantity),
          unitPrice: Number(unitPrice),
          date,
          note: note.trim(),
        });
      } else if (modal === 'payment') {
        if (!customerId || Number(amount) <= 0)
          throw new Error(
            'Enter a customer and a payment amount greater than zero.'
          );
        await api.post('/api/payments', {
          customerId,
          amount: Number(amount),
          date,
          note: note.trim(),
        });
      }
      await loadLedger();
      setModal(null);
    } catch (e) {
      setErrorText(
        e instanceof Error ? e.message : 'Could not save this record.'
      );
    } finally {
      setBusy(false);
    }
  }
  async function deleteCustomer(c: Customer) {
    if (
      !window.confirm(
        'Delete ' +
          c.name +
          '? Customers with sales or payments cannot be deleted.'
      )
    )
      return;
    try {
      await api.delete('/api/customers/' + c.id);
      await loadLedger();
    } catch {
      setErrorText(
        'This customer may already have sales or payments. Keep the record so your ledger stays accurate.'
      );
    }
  }
  function reminder(c: Customer) {
    const balance = Math.max(0, balances[c.id] || 0);
    const message =
      'Hello ' +
      c.name +
      ', this is a friendly reminder that your outstanding balance with us is ' +
      money(balance) +
      '. Please let me know when you can make payment. Thank you.';
    window.open(
      'https://wa.me/' +
        c.phone.replace(/\D/g, '') +
        '?text=' +
        encodeURIComponent(message),
      '_blank',
      'noopener,noreferrer'
    );
  }

  if (loading)
    return (
      <div className="loading-screen">
        <div className="brand-mark">A</div>
        <p>Opening your ledger…</p>
      </div>
    );
  if (!user)
    return (
      <main className="login-screen">
        <div className="login-card">
          <div className="brand-lockup">
            <div className="brand-mark">A</div>
            <span>
              Amin <span className="brand-light">Ledger</span>
            </span>
          </div>
          <div className="login-art">
            <div className="art-circle">
              <Wallet size={36} />
            </div>
            <div className="art-lines">
              <i />
              <i />
              <i />
            </div>
            <div className="art-tag">
              ₦ <span>Know what is owed</span>
            </div>
          </div>
          <p className="eyebrow">YOUR BUSINESS, IN GOOD ORDER</p>
          <h1>
            Every sale.
            <br />
            Every payment.
            <br />
            <span>All accounted for.</span>
          </h1>
          <p className="login-copy">
            A simple, reliable way to track customer credit and know exactly who
            owes you.
          </p>
          <button className="primary-button full-button" onClick={signIn}>
            Sign in to your ledger <ArrowUpRight size={18} />
          </button>
          <p className="fine-print">
            Secure sign-in · Your records are private to your account
          </p>
          {errorText && <p className="error-text">{errorText}</p>}
        </div>
        <div className="login-footer">
          Made for the everyday Nigerian trader <span>•</span> Simple by design
        </div>
      </main>
    );

  const nav = [
    { name: 'Overview', icon: <Wallet size={18} /> },
    { name: 'Customers', icon: <Users size={18} /> },
    { name: 'Credit sales', icon: <ShoppingBag size={18} /> },
    { name: 'Payments', icon: <Banknote size={18} /> },
  ];
  const title = tab === 'Overview' ? 'Your business at a glance' : tab;
  return (
    <div className="app-shell">
      <aside className={'sidebar ' + (mobileMenu ? 'sidebar-open' : '')}>
        <div className="brand-lockup">
          <div className="brand-mark">A</div>
          <span>
            Amin <span className="brand-light">Ledger</span>
          </span>
        </div>
        <div className="side-label">WORKSPACE</div>
        <nav>
          {nav.map(n => (
            <button
              key={n.name}
              className={'nav-item ' + (tab === n.name ? 'active' : '')}
              onClick={() => {
                setTab(n.name);
                setMobileMenu(false);
              }}
            >
              {n.icon}
              <span>{n.name}</span>
              {n.name === 'Customers' && (
                <small>{ledger.customers.length}</small>
              )}
            </button>
          ))}
        </nav>
        <div className="side-bottom">
          <div className="help-card">
            <div className="help-icon">
              <CircleHelp size={17} />
            </div>
            <strong>Keep it simple</strong>
            <p>
              Record every credit sale and payment to keep balances accurate.
            </p>
          </div>
          <div className="profile-row">
            <div className="avatar">
              {(user.name || user.email || 'T').slice(0, 1).toUpperCase()}
            </div>
            <div className="profile-info">
              <strong>{user.name || 'My business'}</strong>
              <span>{user.email || 'Trader account'}</span>
            </div>
            <button
              className="icon-button"
              aria-label="Sign out"
              onClick={signOut}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <button
            className="icon-button mobile-toggle"
            onClick={() => setMobileMenu(!mobileMenu)}
            aria-label="Toggle menu"
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            Workspace <span>/</span> <strong>{tab}</strong>
          </div>
          <div className="top-actions">
            <div className="today-pill">
              <span className="online-dot" /> Ledger is up to date
            </div>
            <div className="top-avatar">
              {(user.name || user.email || 'T').slice(0, 1).toUpperCase()}
            </div>
          </div>
        </header>
        <div className="page-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {new Date().toLocaleDateString('en-NG', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
              <h1>{title}</h1>
              <p className="subtitle">
                {tab === 'Overview'
                  ? 'Here is how your shop is doing today.'
                  : tab === 'Customers'
                    ? 'Manage the people who buy from your business.'
                    : tab === 'Credit sales'
                      ? 'Keep track of goods and services sold on credit.'
                      : 'Record payments and reduce outstanding balances.'}
              </p>
            </div>
            <div className="heading-actions">
              <button
                className="secondary-button"
                onClick={() => openModal('customer')}
              >
                <Plus size={17} /> Add customer
              </button>
              <button
                className="primary-button"
                onClick={() => openModal('sale')}
              >
                <Plus size={17} /> Record credit sale
              </button>
            </div>
          </div>
          {errorText && (
            <div className="inline-error">
              {errorText}
              <button onClick={() => setErrorText('')} aria-label="Dismiss">
                <X size={16} />
              </button>
            </div>
          )}
          {tab === 'Overview' && (
            <>
              <section className="welcome-banner">
                <div className="welcome-content">
                  <span className="welcome-label">
                    <span className="welcome-dot" /> BUSINESS SNAPSHOT
                  </span>
                  <h2>
                    Small records. <span>Big peace of mind.</span>
                  </h2>
                  <p>
                    Keep sales, payments and customer balances in one place.
                  </p>
                  <div className="welcome-actions">
                    <button
                      onClick={() => openModal('payment')}
                      className="banner-button"
                    >
                      Record a payment <ArrowDownLeft size={16} />
                    </button>
                    <span>
                      <Check size={15} /> Your data stays private
                    </span>
                  </div>
                </div>
                <div className="banner-illustration">
                  <div className="float-card float-card-one">
                    <span>Outstanding</span>
                    <strong>{money(outstanding)}</strong>
                    <div className="mini-bars">
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>
                  </div>
                  <div className="float-card float-card-two">
                    <div className="float-check">
                      <Check size={14} />
                    </div>
                    <span>Payment recorded</span>
                  </div>
                  <div className="banner-orbit" />
                </div>
              </section>
              <section className="stats-grid">
                <div className="stat-card">
                  <div className="stat-top">
                    <span>Total outstanding</span>
                    <div className="stat-icon orange">
                      <Wallet size={18} />
                    </div>
                  </div>
                  <div className="stat-value">{money(outstanding)}</div>
                  <div className="stat-foot">
                    <span className="stat-dot orange-dot" /> Balance customers
                    still owe
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-top">
                    <span>Credit sales</span>
                    <div className="stat-icon blue">
                      <ShoppingBag size={18} />
                    </div>
                  </div>
                  <div className="stat-value">{money(salesTotal)}</div>
                  <div className="stat-foot">
                    <span className="stat-dot blue-dot" /> Total goods sold on
                    credit
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-top">
                    <span>Payments received</span>
                    <div className="stat-icon green">
                      <Banknote size={18} />
                    </div>
                  </div>
                  <div className="stat-value">{money(paidTotal)}</div>
                  <div className="stat-foot">
                    <span className="stat-dot green-dot" /> Total payments
                    recorded
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-top">
                    <span>Customers</span>
                    <div className="stat-icon purple">
                      <Users size={18} />
                    </div>
                  </div>
                  <div className="stat-value">{ledger.customers.length}</div>
                  <div className="stat-foot">
                    <span className="stat-dot purple-dot" /> In your customer
                    book
                  </div>
                </div>
              </section>
              <section className="content-grid">
                <div className="panel recent-panel">
                  <div className="panel-heading">
                    <div>
                      <h3>Recent credit sales</h3>
                      <p>Your latest recorded sales</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => setTab('Credit sales')}
                    >
                      View all <ArrowUpRight size={15} />
                    </button>
                  </div>
                  {recentSales.length ? (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>ITEM</th>
                            <th>CUSTOMER</th>
                            <th>DATE</th>
                            <th>AMOUNT</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recentSales.map(s => (
                            <tr key={s.id}>
                              <td>
                                <div className="item-cell">
                                  <span className="item-symbol">
                                    <ShoppingBag size={16} />
                                  </span>
                                  <strong>{s.item}</strong>
                                </div>
                              </td>
                              <td>
                                {ledger.customers.find(
                                  c => c.id === s.customerId
                                )?.name || 'Customer'}
                              </td>
                              <td>{s.date}</td>
                              <td className="amount-cell">{money(s.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <EmptyState
                      title="No credit sales yet"
                      text="When a customer buys on credit, record it here."
                      action="Record first sale"
                      onClick={() => openModal('sale')}
                    />
                  )}
                </div>
                <div className="panel owing-panel">
                  <div className="panel-heading">
                    <div>
                      <h3>Customers who owe</h3>
                      <p>Balances to follow up</p>
                    </div>
                    <span className="count-badge">
                      {
                        ledger.customers.filter(c => (balances[c.id] || 0) > 0)
                          .length
                      }
                    </span>
                  </div>
                  {ledger.customers
                    .filter(c => (balances[c.id] || 0) > 0)
                    .slice(0, 5)
                    .map(c => (
                      <div className="owing-row" key={c.id}>
                        <div className="customer-avatar">
                          {c.name.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="owing-info">
                          <strong>{c.name}</strong>
                          <span>{c.phone || 'No phone number'}</span>
                        </div>
                        <div className="owing-right">
                          <strong>{money(balances[c.id])}</strong>
                          <button
                            onClick={() => reminder(c)}
                            disabled={!c.phone}
                            title="Send WhatsApp reminder"
                          >
                            <MessageCircle size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  {ledger.customers.every(c => (balances[c.id] || 0) <= 0) && (
                    <div className="empty-owing">
                      <div className="empty-check">
                        <Check size={19} />
                      </div>
                      <strong>All clear, for now</strong>
                      <span>
                        Customers with outstanding balances will show here.
                      </span>
                    </div>
                  )}
                  <button
                    className="bottom-link"
                    onClick={() => setTab('Customers')}
                  >
                    Go to customer ledger <ArrowUpRight size={15} />
                  </button>
                </div>
              </section>
            </>
          )}
          {tab === 'Customers' && (
            <section className="panel list-panel">
              <div className="panel-heading">
                <div>
                  <h3>Customer ledger</h3>
                  <p>Every customer and their current balance</p>
                </div>
                <div className="search-box">
                  <Search size={16} />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search name or phone"
                  />
                </div>
              </div>
              {filteredCustomers.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>CUSTOMER</th>
                        <th>PHONE</th>
                        <th>CREDIT SALES</th>
                        <th>OUTSTANDING</th>
                        <th>ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCustomers.map(c => (
                        <tr key={c.id}>
                          <td>
                            <div className="customer-table-cell">
                              <div className="customer-avatar">
                                {c.name.slice(0, 1).toUpperCase()}
                              </div>
                              <strong>{c.name}</strong>
                            </div>
                          </td>
                          <td>{c.phone || '—'}</td>
                          <td>
                            {money(
                              ledger.sales
                                .filter(s => s.customerId === c.id)
                                .reduce((sum, s) => sum + s.total, 0)
                            )}
                          </td>
                          <td>
                            <strong
                              className={
                                (balances[c.id] || 0) > 0
                                  ? 'debt-value'
                                  : 'paid-value'
                              }
                            >
                              {money(Math.max(0, balances[c.id] || 0))}
                            </strong>
                          </td>
                          <td>
                            <div className="row-actions">
                              <button
                                title="WhatsApp reminder"
                                disabled={
                                  !c.phone || (balances[c.id] || 0) <= 0
                                }
                                onClick={() => reminder(c)}
                              >
                                <MessageCircle size={16} />
                              </button>
                              <button
                                title="Edit customer"
                                onClick={() => openModal('customer', c)}
                              >
                                <Download size={16} />
                              </button>
                              <button
                                title="Delete customer"
                                onClick={() => deleteCustomer(c)}
                              >
                                <X size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  title={
                    search
                      ? 'No matching customers'
                      : 'Start your customer book'
                  }
                  text={
                    search
                      ? 'Try a different name or phone number.'
                      : 'Add a customer before recording a credit sale.'
                  }
                  action="Add customer"
                  onClick={() => openModal('customer')}
                />
              )}
            </section>
          )}
          {tab === 'Credit sales' && (
            <section className="panel list-panel">
              <div className="panel-heading">
                <div>
                  <h3>Credit sales</h3>
                  <p>All items recorded as sold on credit</p>
                </div>
                <button
                  className="primary-button"
                  onClick={() => openModal('sale')}
                >
                  <Plus size={16} /> New credit sale
                </button>
              </div>
              {ledger.sales.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>ITEM</th>
                        <th>CUSTOMER</th>
                        <th>DATE</th>
                        <th>QTY</th>
                        <th>UNIT PRICE</th>
                        <th>TOTAL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...ledger.sales]
                        .sort((a, b) => b.date.localeCompare(a.date))
                        .map(s => (
                          <tr key={s.id}>
                            <td>
                              <strong>{s.item}</strong>
                              {s.note && (
                                <div className="muted-small">{s.note}</div>
                              )}
                            </td>
                            <td>
                              {ledger.customers.find(c => c.id === s.customerId)
                                ?.name || 'Customer'}
                            </td>
                            <td>{s.date}</td>
                            <td>{s.quantity}</td>
                            <td>{money(s.unitPrice)}</td>
                            <td className="amount-cell">{money(s.total)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  title="No sales recorded"
                  text="Record the first item a customer takes on credit."
                  action="Record credit sale"
                  onClick={() => openModal('sale')}
                />
              )}
            </section>
          )}
          {tab === 'Payments' && (
            <section className="panel list-panel">
              <div className="panel-heading">
                <div>
                  <h3>Payment history</h3>
                  <p>Money received from customers</p>
                </div>
                <button
                  className="primary-button"
                  onClick={() => openModal('payment')}
                >
                  <Plus size={16} /> Record payment
                </button>
              </div>
              {ledger.payments.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>CUSTOMER</th>
                        <th>DATE</th>
                        <th>NOTE</th>
                        <th>AMOUNT RECEIVED</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...ledger.payments]
                        .sort((a, b) => b.date.localeCompare(a.date))
                        .map(p => (
                          <tr key={p.id}>
                            <td>
                              <div className="customer-table-cell">
                                <div className="customer-avatar">
                                  {(
                                    ledger.customers.find(
                                      c => c.id === p.customerId
                                    )?.name || 'C'
                                  )
                                    .slice(0, 1)
                                    .toUpperCase()}
                                </div>
                                <strong>
                                  {ledger.customers.find(
                                    c => c.id === p.customerId
                                  )?.name || 'Customer'}
                                </strong>
                              </div>
                            </td>
                            <td>{p.date}</td>
                            <td>{p.note || '—'}</td>
                            <td className="paid-value amount-cell">
                              +{money(p.amount)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  title="No payments yet"
                  text="Record money received to reduce a customer's outstanding balance."
                  action="Record payment"
                  onClick={() => openModal('payment')}
                />
              )}
            </section>
          )}
          <footer className="page-footer">
            <span>
              DUKA LEDGER <span className="footer-dot">•</span> Made for small
              businesses
            </span>
            <span>
              <span className="online-dot" /> All records are saved securely
            </span>
          </footer>
        </div>
      </main>
      {modal && (
        <div
          className="modal-backdrop"
          onMouseDown={e => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <section className="modal-card">
            <div className="modal-heading">
              <div>
                <span className="eyebrow">
                  {modal === 'customer'
                    ? 'CUSTOMER BOOK'
                    : modal === 'sale'
                      ? 'CREDIT RECORD'
                      : 'PAYMENT RECORD'}
                </span>
                <h2>
                  {modal === 'customer'
                    ? editingCustomer
                      ? 'Edit customer'
                      : 'Add a customer'
                    : modal === 'sale'
                      ? 'Record credit sale'
                      : 'Record a payment'}
                </h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setModal(null)}
                aria-label="Close"
              >
                <X size={19} />
              </button>
            </div>
            <form onSubmit={submitModal}>
              {modal === 'customer' ? (
                <>
                  <label>
                    Customer name
                    <input
                      required
                      value={customerName}
                      onChange={e => setCustomerName(e.target.value)}
                      placeholder="e.g. Aunty Bisi"
                    />
                  </label>
                  <label>
                    Phone number{' '}
                    <span className="optional">(for WhatsApp reminders)</span>
                    <input
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="e.g. 08012345678"
                    />
                  </label>
                  <label>
                    Notes <span className="optional">(optional)</span>
                    <textarea
                      value={note}
                      onChange={e => setNote(e.target.value)}
                      placeholder="Anything useful to remember"
                    />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    Customer
                    <select
                      required
                      value={customerId}
                      onChange={e => setCustomerId(e.target.value)}
                    >
                      {ledger.customers.length === 0 && (
                        <option value="">Add a customer first</option>
                      )}
                      {ledger.customers.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} · {money(Math.max(0, balances[c.id] || 0))}{' '}
                          owed
                        </option>
                      ))}
                    </select>
                  </label>
                  {modal === 'sale' ? (
                    <>
                      <label>
                        Item or service
                        <input
                          required
                          value={item}
                          onChange={e => setItem(e.target.value)}
                          placeholder="e.g. 2 bags of rice"
                        />
                      </label>
                      <div className="form-two">
                        <label>
                          Quantity
                          <input
                            required
                            type="number"
                            min="1"
                            step="1"
                            value={quantity}
                            onChange={e => setQuantity(e.target.value)}
                          />
                        </label>
                        <label>
                          Unit price (₦)
                          <input
                            required
                            type="number"
                            min="1"
                            step="0.01"
                            value={unitPrice}
                            onChange={e => setUnitPrice(e.target.value)}
                            placeholder="0.00"
                          />
                        </label>
                      </div>
                      {Number(unitPrice) > 0 && Number(quantity) > 0 && (
                        <div className="total-preview">
                          <span>Sale total</span>
                          <strong>
                            {money(Number(unitPrice) * Number(quantity))}
                          </strong>
                        </div>
                      )}
                    </>
                  ) : (
                    <label>
                      Amount received (₦)
                      <input
                        required
                        type="number"
                        min="1"
                        step="0.01"
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        placeholder="0.00"
                      />
                    </label>
                  )}
                  <label>
                    Date
                    <input
                      required
                      type="date"
                      value={date}
                      onChange={e => setDate(e.target.value)}
                    />
                  </label>
                  <label>
                    Note <span className="optional">(optional)</span>
                    <textarea
                      value={note}
                      onChange={e => setNote(e.target.value)}
                      placeholder="Payment method or other details"
                    />
                  </label>
                </>
              )}
              {errorText && <p className="error-text">{errorText}</p>}
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setModal(null)}
                >
                  Cancel
                </button>
                <button
                  disabled={
                    busy ||
                    (modal !== 'customer' && ledger.customers.length === 0)
                  }
                  type="submit"
                  className="primary-button"
                >
                  {busy
                    ? 'Saving…'
                    : modal === 'customer'
                      ? editingCustomer
                        ? 'Save changes'
                        : 'Add customer'
                      : modal === 'sale'
                        ? 'Save credit sale'
                        : 'Save payment'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

function EmptyState({
  title,
  text,
  action,
  onClick,
}: {
  title: string;
  text: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <ShoppingBag size={20} />
      </div>
      <strong>{title}</strong>
      <p>{text}</p>
      <button className="secondary-button" onClick={onClick}>
        <Plus size={16} />
        {action}
      </button>
    </div>
  );
}
export default App;
