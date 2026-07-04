function randomIndex(max: number): number {
  const values = new Uint32Array(1);
  window.crypto.getRandomValues(values);
  return values[0] % max;
}

export function generateStrongPassword(length = 18): string {
  const groups = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%&*+-=?'];
  const characters = groups.map((group) => group[randomIndex(group.length)]);
  const pool = groups.join('');
  while (characters.length < length) characters.push(pool[randomIndex(pool.length)]);
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
  }
  return characters.join('');
}
