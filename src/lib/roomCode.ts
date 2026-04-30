export function generateRoomCode(): string {
	const n = Math.floor(100000 + Math.random() * 900000);
	return String(n);
}

export function isValidCode(code: string): boolean {
	return /^\d{6}$/.test(code);
}
