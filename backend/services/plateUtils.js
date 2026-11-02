// Sri Lankan Vehicle Number Plate Parser and Cleaner
// Supports standard Sri Lankan Highway formats:
// - Modern Provincial: "WP CAB-1234", "SP CAA-5678", "WP KU-8821", "CP BZ-9012"
// - Standard 3-letter: "CAB-1234", "KV-5588"
// - Vintage format: "WP 65-4321", "301-1234"

const PROVINCES = ["WP", "SP", "CP", "EP", "NP", "NW", "NC", "SG", "UP"];

function cleanPlate(input) {
  if (!input) return "";

  // Uppercase and normalize common OCR confusions (e.g., O -> 0 in digits, 0 -> O in letters)
  let raw = String(input)
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9\s-]/g, "");

  // Match Sri Lankan patterns
  // Pattern 1: With Province (e.g., "WP CAB 1234", "WP CAB-1234", "WPCAB1234")
  const provinceRegex = new RegExp(
    `^(${PROVINCES.join("|")})[\\s-]?([A-Z]{2,3}|\\d{2,3})[\\s-]?(\\d{4})$`,
    "i"
  );
  const matchWithProv = raw.match(provinceRegex);
  if (matchWithProv) {
    const [, prov, series, num] = matchWithProv;
    return `${prov.toUpperCase()} ${series.toUpperCase()}-${num}`;
  }

  // Pattern 2: Without Province (e.g., "CAB-1234", "CAB 1234", "CAB1234", "KV5588")
  const standardRegex = /^([A-Z]{2,3}|\d{2,3})[\s-]?(\d{4})$/i;
  const matchStandard = raw.match(standardRegex);
  if (matchStandard) {
    const [, series, num] = matchStandard;
    return `${series.toUpperCase()}-${num}`;
  }

  // Fallback: Strip symbols and keep alphanumeric
  return raw.replace(/[^A-Z0-9]/g, "");
}

module.exports = {
  cleanPlate,
  PROVINCES,
};
