// Kusy pomůcky objednané k prodeji (sales.status = 'ordered') jsou do
// potvrzení prodeje blokované stejně jako půjčené. Vkládá se do dotazů,
// kde je $1 = id pomůcky.
export const ORDERED_QTY_SQL = `(SELECT COALESCE(SUM(quantity), 0) FROM sales WHERE item_id = $1 AND status = 'ordered')`;
