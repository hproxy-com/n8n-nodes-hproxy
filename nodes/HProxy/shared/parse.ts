import type { IDataObject } from 'n8n-workflow';

/*
 * Pure helpers that turn what a user typed into what HProxy's API takes.
 * They hold no n8n context, so the tests in test/ call them directly.
 */

/** A list typed with commas or new lines, or handed in as an array by an expression. */
export function toList(value: unknown): string[] {
	let parts: unknown[];
	if (Array.isArray(value)) {
		parts = value;
	} else if (typeof value === 'string') {
		parts = value.split(/[\r\n,]+/);
	} else if (value === undefined || value === null) {
		parts = [];
	} else {
		parts = [value];
	}
	return parts.map((part) => String(part).trim()).filter((part) => part.length > 0);
}

/** The whole numbers of a typed list, or null when any entry is something else. */
export function toWholeNumbers(value: unknown): number[] | null {
	const numbers: number[] = [];
	for (const entry of toList(value)) {
		if (!/^\d{1,10}$/.test(entry)) {
			return null;
		}
		numbers.push(Number(entry));
	}
	return numbers;
}

const PLAN_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Plan IDs are letters, digits, dashes and underscores (for example cmjfmhhpd004c4i4hqsk3mzrr). */
export function isPlanId(value: unknown): value is string {
	return typeof value === 'string' && PLAN_ID.test(value);
}

/** True for text shaped like an IPv4 or IPv6 address. The API makes the final call. */
export function looksLikeIp(value: string): boolean {
	return /^[0-9A-Fa-f:.]{2,45}$/.test(value) && /[.:]/.test(value);
}

/** A product id such as residential-premium, written the way people read it. */
export function productName(productId: unknown): string {
	if (typeof productId !== 'string' || productId.length === 0) {
		return 'Plan';
	}
	return productId
		.split(/[-_]/)
		.filter((word) => word.length > 0)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}

/** A GB figure rounded to two decimals, without trailing zeros. */
export function formatGb(value: unknown): string {
	const gb = typeof value === 'number' && Number.isFinite(value) ? value : 0;
	return String(Math.round(gb * 100) / 100);
}

/** The Retry-After header in whole seconds, when the API sent a usable one. */
export function retryAfterSeconds(headers: unknown): number | undefined {
	if (!headers || typeof headers !== 'object') {
		return undefined;
	}
	const record = headers as Record<string, unknown>;
	const raw = record['retry-after'] ?? record['Retry-After'];
	const seconds = Number(Array.isArray(raw) ? raw[0] : raw);
	return raw !== undefined && raw !== null && Number.isFinite(seconds) && seconds >= 0
		? Math.ceil(seconds)
		: undefined;
}

/** A copy of an object with only the given keys, in the given order. */
export function pick(source: IDataObject, keys: readonly string[]): IDataObject {
	const kept: IDataObject = {};
	for (const key of keys) {
		if (Object.prototype.hasOwnProperty.call(source, key)) {
			kept[key] = source[key];
		}
	}
	return kept;
}
