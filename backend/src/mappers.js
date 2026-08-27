// Převod řádků z PostgreSQL (snake_case) na tvar, se kterým pracuje frontend (camelCase),
// beze změny na existujícím datovém modelu React aplikace.

export function mapClient(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone || "",
    address: row.address || "",
    note: row.note || "",
  };
}

export function mapItem(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category || "",
    quantityTotal: row.quantity_total,
    dailyRate: row.daily_rate,
    priceTiers: row.price_tiers || [],
    serviceFlag: row.service_flag,
  };
}

export function mapReservation(row) {
  return {
    id: row.id,
    clientId: row.client_id,
    itemId: row.item_id,
    quantity: row.quantity,
    startDate: row.start_date,
    endDate: row.end_date,
    deposit: row.deposit,
    price: row.price,
    status: row.status,
    paymentStatus: row.payment_status,
    returnedAt: row.returned_at,
  };
}

export function mapPayment(row) {
  return {
    id: row.id,
    clientId: row.client_id,
    date: row.date,
    amount: row.amount,
    method: row.method || "",
    variableSymbol: row.variable_symbol || "",
    note: row.note || "",
  };
}
