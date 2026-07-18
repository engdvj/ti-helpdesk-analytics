export interface ComparableValue {
  usersId: number;
  value: number;
}

/** Retorna todos os lideres de um ponto; empate real continua empate. */
export function findLeaderIds(values: ComparableValue[], higherIsBetter: boolean): Set<number> {
  if (values.length === 0) return new Set();
  const best = higherIsBetter
    ? Math.max(...values.map((item) => item.value))
    : Math.min(...values.map((item) => item.value));
  return new Set(
    values
      .filter((item) => Math.abs(item.value - best) < 1e-9)
      .map((item) => item.usersId),
  );
}
