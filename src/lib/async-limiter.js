export function createAsyncLimiter(maxConcurrent) {
  const limit = Number(maxConcurrent);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new TypeError('maxConcurrent must be a positive integer');
  }

  let active = 0;
  const queue = [];

  const drain = () => {
    while (active < limit && queue.length) {
      const task = queue.shift();
      active += 1;
      Promise.resolve()
        .then(task.operation)
        .then(task.resolve, task.reject)
        .finally(() => {
          active -= 1;
          drain();
        });
    }
  };

  return (operation) => new Promise((resolve, reject) => {
    if (typeof operation !== 'function') {
      reject(new TypeError('operation must be a function'));
      return;
    }
    queue.push({ operation, resolve, reject });
    drain();
  });
}
