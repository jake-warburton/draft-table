/**
 * Immutable evidence for one observed response, not a Card Vault API version or stability promise.
 * The endpoint is intentionally never contacted by application code.
 */
export const CARD_VAULT_OMENS_PRODUCT_RESPONSE = Object.freeze({
  artifact: "CARD_VAULT_OMENS_PRODUCT_CARDS_RESPONSE",
  evidenceId: "card-vault-omens-product-cards-observed-2026-08-04",
  observedOn: "2026-08-04",
  endpoint: "https://api.cardvault.fabtcg.com/carddb/api/v1/product-cards/omens-of-the-third-age/",
  mediaType: "application/json",
  byteLength: 168977,
  sha256: "59f26e3071ef50a0515c99ce568110934290aad698b3669b45e224e52fc1a83f",
  provenance: "official-card-vault-public-product-endpoint-observed-response",
  stability: "unversioned endpoint; no ETag, Last-Modified, or version stability promise observed"
});
