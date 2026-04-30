export async function detectBeats(audioBlob: Blob): Promise<number[]> {
	const arrayBuffer = await audioBlob.arrayBuffer();
	const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
	const ctx = new Ctx();
	const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
	const data = buffer.getChannelData(0);
	const sampleRate = buffer.sampleRate;
	const windowSize = Math.floor(sampleRate * 0.04);
	const energies: number[] = [];
	for (let i = 0; i < data.length; i += windowSize) {
		let sum = 0;
		const end = Math.min(i + windowSize, data.length);
		for (let j = i; j < end; j++) sum += data[j] * data[j];
		energies.push(sum / (end - i));
	}
	const beats: number[] = [];
	const localWindow = 25;
	for (let i = 1; i < energies.length - 1; i++) {
		const lo = Math.max(0, i - localWindow);
		const hi = Math.min(energies.length, i + localWindow);
		let avg = 0;
		for (let k = lo; k < hi; k++) avg += energies[k];
		avg /= hi - lo;
		if (
			energies[i] > avg * 1.6 &&
			energies[i] > energies[i - 1] &&
			energies[i] >= energies[i + 1]
		) {
			const t = (i * windowSize) / sampleRate;
			if (beats.length === 0 || t - beats[beats.length - 1] > 0.18) beats.push(t);
		}
	}
	void ctx.close();
	return beats;
}
