/** Reject (or resolve null) when `promise` takes longer than `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number, label = "Timed out"): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
