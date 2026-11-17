// The one test of Stripe's answer that a stored customer is gone (A11-10, the 404 rule; A4-02), shared
// by the account cleanup pass (_shared/accountCleanup.ts) and payment-methods' list action. Plain
// JavaScript and no imports, so the node tests import this file as it is.
//
// Stripe's word that this very customer is deleted: an answer about the customer (the cleanup's DELETE,
// or a READ, GET /v1/customers/<id>) with success, deleted: true and the same id (Stripe's API
// reference, "Retrieve a customer": a deleted customer is returned as a subset of its information with
// a deleted property set to true).
// Nothing else decides it. An error, resource_missing with a 404 included, says only that this key does
// not know the id (Stripe's error codes: "Either the resource doesn't exist, or an ID for a different
// resource has been provided"): the customer may live under another account or the other mode, with
// its cards.

/**
 * @param {number} status the HTTP status of Stripe's answer
 * @param {unknown} body the parsed answer
 * @param {string} id the customer that was asked for
 * @returns {boolean}
 */
export function isDeletedCustomer(status, body, id) {
  return status === 200 && body !== null && typeof body === 'object' && !Array.isArray(body)
    && body.deleted === true && body.id === id;
}
