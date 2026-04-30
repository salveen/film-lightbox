export function generateRoomCode(): string {
	const n = Math.floor(1000 + Math.random() * 9000);
	return String(n);
}

export function isValidCode(code: string): boolean {
	return /^\d{4}$/.test(code);
}
