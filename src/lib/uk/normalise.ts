// Place-name form used for matching: "St. Albans" = "st albans", "King's Lynn" = "kings lynn",
// "Ynys Môn" = "ynys mon". Used both when building the data file and when reading job locations.
export function normPlace(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
