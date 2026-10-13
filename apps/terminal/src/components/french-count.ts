/** Small readable counts with the correct French singular/plural forms. */
export function frenchCount(n: number, noun: string): string {
  return `${n} ${noun}${n > 1 ? 's' : ''}`;
}
