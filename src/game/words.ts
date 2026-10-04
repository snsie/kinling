// Word helpers shared by recall, fact checks and appraisal: keywords without
// filler words, simple singulars, and small concept groups.

const STOPWORDS = new Set(
  'the and you your are was were for with that this have has had what when where how why who did does can could would should will just like about into from they them then than there their our out its not but all any been being some very really much more most also too yes yeah okay ok hey hello'.split(' '),
);

export function keywords(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !STOPWORDS.has(w)),
    ),
  ];
}

// Small concept groups so "what's my favorite weather?" can find "I love
// rainy days". Sharing a concept counts for less than sharing a word.
const CONCEPTS: Record<string, string[]> = {
  weather: ['weather', 'rain', 'rainy', 'raining', 'sun', 'sunny', 'sunshine', 'snow', 'snowy', 'cloud', 'cloudy', 'storm', 'windy', 'cold', 'warm', 'hot'],
  food: ['food', 'eat', 'eating', 'snack', 'snacks', 'hungry', 'meal', 'dinner', 'lunch', 'breakfast', 'cook', 'cooking', 'bake', 'baking', 'cake', 'pizza', 'berry', 'dewberry', 'plum', 'bun'],
  color: ['color', 'colour', 'colors', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'black', 'white', 'brown', 'gold'],
  pet: ['pet', 'pets', 'dog', 'dogs', 'puppy', 'cat', 'cats', 'kitten', 'bird', 'hamster', 'rabbit', 'bunny', 'turtle'],
  family: ['family', 'mom', 'mum', 'mother', 'dad', 'father', 'sister', 'brother', 'grandma', 'grandpa', 'grandmother', 'grandfather', 'parents', 'aunt', 'uncle', 'cousin', 'baby'],
  friend: ['friend', 'friends', 'friendship', 'buddy', 'pal'],
  school: ['school', 'class', 'teacher', 'homework', 'test', 'exam', 'lesson', 'study', 'work', 'job', 'office'],
  music: ['music', 'song', 'songs', 'sing', 'singing', 'dance', 'dancing', 'piano', 'guitar', 'cello', 'violin', 'recital', 'concert', 'band', 'orchestra'],
  water: ['pond', 'water', 'swim', 'swimming', 'lake', 'river', 'sea', 'ocean', 'beach', 'fish', 'frog', 'frogs', 'lily', 'reeds', 'shallows', 'shell', 'pearl'],
  garden: ['garden', 'flower', 'flowers', 'bee', 'bees', 'plant', 'plants', 'clover', 'leaf', 'leaves', 'petal', 'petals', 'tree', 'acorn', 'ladybug'],
  sky: ['sky', 'star', 'stars', 'moon', 'night', 'stardust', 'starlit', 'space'],
  sleep: ['sleep', 'sleepy', 'nap', 'naps', 'tired', 'bed', 'bedtime', 'dream', 'dreams', 'rest'],
  play: ['play', 'playing', 'game', 'games', 'chase', 'fun', 'toy', 'toys', 'adventure', 'explore'],
  celebration: ['birthday', 'party', 'present', 'gift', 'holiday', 'celebrate', 'festival', 'turns'],
  worry: ['nervous', 'worried', 'worry', 'scared', 'afraid', 'anxious', 'stressed', 'upset', 'sad', 'rough', 'mean', 'cried', 'lonely', 'down'],
  brave: ['brave', 'braver', 'bravest', 'courage', 'proud', 'bold', 'fearless', 'believe'],
  time: ['today', 'tomorrow', 'yesterday', 'week', 'weekend', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'soon'],
};
const WORD_CONCEPTS = new Map<string, string[]>();
for (const [concept, words] of Object.entries(CONCEPTS)) {
  for (const w of words) WORD_CONCEPTS.set(w, [...(WORD_CONCEPTS.get(w) ?? []), `#${concept}`]);
}

/** Keywords plus simple singulars and "#concept" tags, for retrieval. */
export function expandKeywords(words: string[]): string[] {
  const out = new Set<string>();
  for (const w of words) {
    out.add(w);
    const single = w.length > 4 && w.endsWith('ies') ? `${w.slice(0, -3)}y` : w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : null;
    if (single) out.add(single);
    for (const c of [...(WORD_CONCEPTS.get(w) ?? []), ...(single ? (WORD_CONCEPTS.get(single) ?? []) : [])]) out.add(c);
  }
  return [...out];
}
