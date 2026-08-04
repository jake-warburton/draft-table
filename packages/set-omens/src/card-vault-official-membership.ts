import { sha256Hex } from "./sha256.ts";

export class CardVaultOfficialMembershipError extends Error {
  readonly code = "CARD_VAULT_OFFICIAL_MEMBERSHIP_INVALID";

  constructor() {
    super("Official Card Vault membership is invalid.");
    this.name = "CardVaultOfficialMembershipError";
    this.stack = `${this.name}: ${this.message}`;
  }
}

declare const officialCardVaultMembershipBrand: unique symbol;

/** Opaque build-time capability; its canonical membership is retained privately. */
export type OfficialCardVaultMembership = Readonly<{
  [officialCardVaultMembershipBrand]: true;
}>;

type MembershipFact = Readonly<{
  total: number;
  omn: number;
  iar: number;
  byteLength: number;
  sha256: string;
}>;

const OFFICIAL_MEMBERSHIP_FACT: MembershipFact = Object.freeze({
  total: 260,
  omn: 251,
  iar: 9,
  byteLength: 1874,
  sha256: "9b16117e4f558c91421a50d814baa3a8a16043bff645cec24291a32df6e079de"
});

const idsByMembership = new WeakMap<OfficialCardVaultMembership, readonly string[]>();
const MAX_JSON_DEPTH = 512;

/** Validates JSON syntax and duplicate keys before JSON.parse materializes values. */
class JsonSyntaxScanner {
  #offset = 0;

  private readonly text: string;

  constructor(text: string) {
    this.text = text;
  }

  scan(): void {
    this.value(0);
    this.whitespace();
    if (this.#offset !== this.text.length) throw new SyntaxError();
  }

  private value(depth: number): void {
    if (depth > MAX_JSON_DEPTH) throw new SyntaxError();
    this.whitespace();
    const character = this.text[this.#offset];
    if (character === "{") return this.object(depth + 1);
    if (character === "[") return this.array(depth + 1);
    if (character === '"') { this.string(); return; }
    if (character === "t") return this.literal("true");
    if (character === "f") return this.literal("false");
    if (character === "n") return this.literal("null");
    if (character === "-" || (character !== undefined && character >= "0" && character <= "9")) return this.number();
    throw new SyntaxError();
  }

  private object(depth: number): void {
    this.#offset++;
    const keys = new Set<string>();
    this.whitespace();
    if (this.text[this.#offset] === "}") { this.#offset++; return; }
    while (true) {
      this.whitespace();
      if (this.text[this.#offset] !== '"') throw new SyntaxError();
      const key = this.string();
      if (keys.has(key)) throw new SyntaxError();
      keys.add(key);
      this.whitespace();
      if (this.text[this.#offset++] !== ":") throw new SyntaxError();
      this.value(depth);
      this.whitespace();
      const separator = this.text[this.#offset++];
      if (separator === "}") return;
      if (separator !== ",") throw new SyntaxError();
    }
  }

  private array(depth: number): void {
    this.#offset++;
    this.whitespace();
    if (this.text[this.#offset] === "]") { this.#offset++; return; }
    while (true) {
      this.value(depth);
      this.whitespace();
      const separator = this.text[this.#offset++];
      if (separator === "]") return;
      if (separator !== ",") throw new SyntaxError();
    }
  }

  private string(): string {
    let result = "";
    this.#offset++;
    while (this.#offset < this.text.length) {
      const character = this.text[this.#offset++];
      if (character === '"') return result;
      if (character === "\\") {
        const escape = this.text[this.#offset++];
        if (escape === '"' || escape === "\\" || escape === "/") result += escape;
        else if (escape === "b") result += "\b";
        else if (escape === "f") result += "\f";
        else if (escape === "n") result += "\n";
        else if (escape === "r") result += "\r";
        else if (escape === "t") result += "\t";
        else if (escape === "u") {
          const hex = this.text.slice(this.#offset, this.#offset + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new SyntaxError();
          result += String.fromCharCode(Number.parseInt(hex, 16));
          this.#offset += 4;
        } else throw new SyntaxError();
      } else {
        if (character === undefined || character < " ") throw new SyntaxError();
        result += character;
      }
    }
    throw new SyntaxError();
  }

  private whitespace(): void {
    while ([" ", "\n", "\r", "\t"].includes(this.text[this.#offset] ?? "")) this.#offset++;
  }

  private literal(source: string): void {
    if (this.text.slice(this.#offset, this.#offset + source.length) !== source) throw new SyntaxError();
    this.#offset += source.length;
  }

  private number(): void {
    if (this.text[this.#offset] === "-") this.#offset++;
    if (this.text[this.#offset] === "0") this.#offset++;
    else {
      if (!(this.text[this.#offset] >= "1" && this.text[this.#offset] <= "9")) throw new SyntaxError();
      while (this.text[this.#offset] >= "0" && this.text[this.#offset] <= "9") this.#offset++;
    }
    if (this.text[this.#offset] === ".") {
      this.#offset++;
      if (!(this.text[this.#offset] >= "0" && this.text[this.#offset] <= "9")) throw new SyntaxError();
      while (this.text[this.#offset] >= "0" && this.text[this.#offset] <= "9") this.#offset++;
    }
    if (this.text[this.#offset] === "e" || this.text[this.#offset] === "E") {
      this.#offset++;
      if (this.text[this.#offset] === "+" || this.text[this.#offset] === "-") this.#offset++;
      if (!(this.text[this.#offset] >= "0" && this.text[this.#offset] <= "9")) throw new SyntaxError();
      while (this.text[this.#offset] >= "0" && this.text[this.#offset] <= "9") this.#offset++;
    }
  }
}

const parseResponse = (bytes: Uint8Array): unknown => {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    new JsonSyntaxScanner(text).scan();
    return JSON.parse(text);
  } catch {
    throw new CardVaultOfficialMembershipError();
  }
};

const canonicalMembership = (response: unknown): readonly string[] => {
  if (response === null || typeof response !== "object" || Array.isArray(response)) throw new CardVaultOfficialMembershipError();
  const product = response as { product_name?: unknown; release_date?: unknown; cards?: unknown };
  if (product.product_name !== "Omens of the Third Age" || product.release_date !== "2026-06-05" || !Array.isArray(product.cards)) {
    throw new CardVaultOfficialMembershipError();
  }
  const ids = product.cards.map((card) => {
    if (card === null || typeof card !== "object" || Array.isArray(card)) throw new CardVaultOfficialMembershipError();
    const id = (card as { print_id?: unknown }).print_id;
    if (typeof id !== "string" || id.length === 0 || id !== id.trim() || id !== id.normalize("NFC") || !/^[\x21-\x7e]+$/.test(id) || !/^(?:OMN|IAR)/.test(id)) {
      throw new CardVaultOfficialMembershipError();
    }
    return id;
  });
  if (new Set(ids).size !== ids.length) throw new CardVaultOfficialMembershipError();
  return Object.freeze([...ids].sort());
};

/** Package-internal test seam for compact fictional membership contracts. */
export const validateCardVaultOfficialMembershipBytesAgainstFact = (
  bytes: Uint8Array,
  fact: MembershipFact
): OfficialCardVaultMembership => {
  const ids = canonicalMembership(parseResponse(bytes));
  const canonicalBytes = new TextEncoder().encode(`${ids.join("\n")}\n`);
  const omn = ids.filter((id) => id.startsWith("OMN")).length;
  const iar = ids.filter((id) => id.startsWith("IAR")).length;
  if (ids.length !== fact.total || omn !== fact.omn || iar !== fact.iar || canonicalBytes.byteLength !== fact.byteLength || sha256Hex(canonicalBytes) !== fact.sha256) {
    throw new CardVaultOfficialMembershipError();
  }
  const membership = Object.freeze({}) as OfficialCardVaultMembership;
  idsByMembership.set(membership, ids);
  return membership;
};

/** Derives and pins official product membership from caller-provided live-response bytes. */
export const validateCardVaultOmensOfficialMembershipBytes = (bytes: Uint8Array): OfficialCardVaultMembership =>
  validateCardVaultOfficialMembershipBytesAgainstFact(bytes, OFFICIAL_MEMBERSHIP_FACT);

/** Package-internal reconciliation seam; always returns an independent canonical-order copy. */
export const readOfficialCardVaultMembershipPrintIdsForReconciliation = (
  membership: OfficialCardVaultMembership
): string[] => {
  const ids = idsByMembership.get(membership);
  if (ids === undefined) throw new CardVaultOfficialMembershipError();
  return [...ids];
};
