export const WORD_LIST = [
	'amber', 'anchor', 'apple', 'arch', 'arrow',
	'aspen', 'atlas', 'birch', 'blaze', 'bloom',
	'bluff', 'bold', 'bolt', 'brace', 'brass',
	'brave', 'brine', 'brook', 'brood', 'brush',
	'burst', 'cabin', 'cairn', 'cedar', 'chalk',
	'charm', 'chase', 'chest', 'chief', 'cinch',
	'cleft', 'cliff', 'cloak', 'cloud', 'clover',
	'coast', 'comet', 'coral', 'crane', 'creek',
	'crest', 'crisp', 'cross', 'crown', 'crust',
	'delta', 'depot', 'dew', 'drift', 'dusk',
	'eagle', 'ember', 'epoch', 'fable', 'falcon',
	'fern', 'field', 'finch', 'flare', 'flash',
	'flint', 'flood', 'flora', 'flume', 'forge',
	'forte', 'forth', 'frost', 'fumes', 'gale',
	'garnet', 'gate', 'glade', 'glare', 'gleam',
	'glint', 'glow', 'glyph', 'gorge', 'grace',
	'grain', 'grand', 'grant', 'grasp', 'gravel',
	'grove', 'guard', 'guide', 'guild', 'guise',
	'gulf', 'haven', 'hawk', 'hazel', 'haze',
	'helm', 'heron', 'hill', 'hollow', 'hue',
	'inlet', 'iron', 'isle', 'ivory', 'jade',
	'jasper', 'keen', 'kelp', 'knoll', 'larch',
	'lava', 'ledge', 'lemon', 'light', 'linden',
	'loft', 'lotus', 'lunar', 'lush', 'maple',
	'marsh', 'mast', 'mesa', 'mist', 'moose',
	'mossy', 'mount', 'mulch', 'myrrh', 'noble',
	'north', 'notch', 'oak', 'oasis', 'obsidian',
	'ocean', 'onyx', 'otter', 'parch', 'patch',
	'peak', 'peat', 'petal', 'pine', 'plume',
	'pond', 'prism', 'pulse', 'quartz', 'quest',
	'quiet', 'rain', 'rapid', 'raven', 'reef',
	'ridge', 'rift', 'roan', 'rocky', 'root',
	'rover', 'ruby', 'ruddy', 'russet', 'sage',
	'sand', 'shard', 'shift', 'shore', 'slate',
	'slope', 'smoke', 'solar', 'spark', 'spire',
	'spray', 'spruce', 'squall', 'stag', 'stark',
	'steam', 'steel', 'stone', 'storm', 'strand',
	'stream', 'strife', 'surge', 'swift', 'talon',
	'thorn', 'tide', 'timber', 'torch', 'trail',
	'tundra', 'vale', 'vapor', 'vault', 'veil',
	'verge', 'vivid', 'wade', 'wave', 'wedge',
	'willow', 'wisp', 'wren', 'zenith'
];

export function generateRoomWord(): string {
	return WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)];
}

export function isValidWord(w: string): boolean {
	return WORD_LIST.includes(w.toLowerCase().trim());
}
