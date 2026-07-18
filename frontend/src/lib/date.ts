const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/;
const ISO_PERIOD_RANGE_PATTERN = /^(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})$/;
const ISO_MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

/** Formata datas ISO sem passar pelo parser de Date, evitando que o fuso de
 * Brasil recue datas sem horario para o dia anterior. */
export function formatDatePtBr(value: string | null | undefined): string {
  if (!value) return "—";
  const match = value.match(ISO_DATE_PATTERN);
  if (!match) return value;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

/** Formata os tres formatos produzidos por pandas.Period na timeline:
 * dia, intervalo semanal e mes inteiro. */
export function formatPeriodRef(value: string | null | undefined): string {
  if (!value) return "—";

  const range = value.match(ISO_PERIOD_RANGE_PATTERN);
  if (range) return `${formatDatePtBr(range[1])}–${formatDatePtBr(range[2])}`;

  const month = value.match(ISO_MONTH_PATTERN);
  if (month) {
    const year = Number(month[1]);
    const monthNumber = Number(month[2]);
    const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    return `01/${month[2]}/${month[1]}–${String(lastDay).padStart(2, "0")}/${month[2]}/${month[1]}`;
  }

  return formatDatePtBr(value);
}
